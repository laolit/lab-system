const express = require('express');
const sql = require('mssql');
const { authMiddleware } = require('../middleware/auth');
const { query: dbQuery } = require('../utils/db');
const { decryptPassword } = require('../utils/crypto');

const router = express.Router();

// ============================================
// 重点检验项目 TAT 配置（mock 数据用）
// ============================================
const TEST_ITEMS = [
  { code: 'CBC',  name: '血常规',         pre_target: 30, intra_target: 60 },
  { code: 'UR',   name: '尿常规',         pre_target: 20, intra_target: 40 },
  { code: 'BC',   name: '生化全项',       pre_target: 30, intra_target: 90 },
  { code: 'CG',   name: '凝血功能',       pre_target: 20, intra_target: 60 },
  { code: 'TF',   name: '甲状腺功能',     pre_target: 30, intra_target: 120 },
  { code: 'TM',   name: '肿瘤标志物',     pre_target: 30, intra_target: 120 },
  { code: 'HBV',  name: '乙肝五项',       pre_target: 30, intra_target: 120 },
  { code: 'GLU',  name: '血糖',           pre_target: 20, intra_target: 30 },
];

// 生成随机 TAT（在目标值附近波动）
function randomTAT(target, variance = 0.25) {
  const min = Math.round(target * (1 - variance));
  const max = Math.round(target * (1 + variance));
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================
// GET /api/quality/tat-dashboard
// 返回 TAT 质量监控仪表盘全部数据
// ============================================
router.get('/tat-dashboard', authMiddleware, (req, res) => {
  const { group_id } = req.user;

  // 生成各项目 TAT 数据
  const items = TEST_ITEMS.map(item => {
    const pre_tat = randomTAT(item.pre_target);
    const intra_tat = randomTAT(item.intra_target);
    const total_target = item.pre_target + item.intra_target;
    const total_actual = pre_tat + intra_tat;
    const pass_rate = Math.min(100, Math.round((total_target / Math.max(total_actual, 1)) * 100));
    const samples = Math.floor(Math.random() * 200) + 30;

    return {
      code: item.code,
      name: item.name,
      pre_tat,                               // 实验前实际TAT（分钟）
      intra_tat,                             // 实验内实际TAT（分钟）
      pre_target: item.pre_target,           // 实验前目标TAT（分钟）
      intra_target: item.intra_target,        // 实验内目标TAT（分钟）
      total_actual,                          // 总实际TAT
      total_target,                          // 总目标TAT
      samples,                               // 样本数
      pass_rate,                             // 达标率(%)
    };
  });

  // 汇总统计
  const avg_pre_tat = Math.round(items.reduce((s, i) => s + i.pre_tat, 0) / items.length);
  const avg_intra_tat = Math.round(items.reduce((s, i) => s + i.intra_tat, 0) / items.length);
  const avg_pass_rate = Math.round(items.reduce((s, i) => s + i.pass_rate, 0) / items.length * 10) / 10;
  const total_samples = items.reduce((s, i) => s + i.samples, 0);

  // 近30天趋势数据
  const trend = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    // 全项目平均，带小幅随机波动
    const basePre = avg_pre_tat;
    const baseIntra = avg_intra_tat;
    trend.push({
      date: dateStr,
      avg_pre_tat: Math.round(basePre + (Math.random() - 0.5) * 12),
      avg_intra_tat: Math.round(baseIntra + (Math.random() - 0.5) * 18),
    });
  }

  res.json({
    code: 200,
    data: {
      summary: {
        avg_pre_tat,
        avg_intra_tat,
        pass_rate: avg_pass_rate,
        total_samples,
      },
      items,
      trend,
    },
  });
});

// ============================================
// GET /api/quality/dashboard-data
// 从 tat_query_configs 读取活跃配置，连接外部数据源执行SQL，返回动态仪表盘数据
// ============================================
router.get('/dashboard-data', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;

    // 1. 获取所有活跃查询配置 + 关联数据源
    const configsResult = await dbQuery(
      `SELECT q.*, s.name AS source_name, s.server, s.port, s.database_name, s.username, s.password_enc
       FROM tat_query_configs q
       JOIN tat_db_sources s ON q.source_id = s.id
       WHERE q.group_id = @p0 AND q.is_active = 1 AND s.is_active = 1
         AND q.target_module IS NOT NULL AND q.target_module != ''
       ORDER BY q.target_module, q.id`,
      [groupId],
      [sql.Int]
    );

    const configs = configsResult.recordset;

    // 2. 按 target_module 分组执行查询
    const modules = {};

    for (const cfg of configs) {
      const module = cfg.target_module;
      if (!modules[module]) {
        modules[module] = [];
      }

      let pool = null;
      let data = null;
      let error = null;
      let columns = [];

      try {
        const password = decryptPassword(cfg.password_enc);
        const dbConfig = {
          user: cfg.username,
          password,
          server: cfg.server,
          database: cfg.database_name,
          port: cfg.port || 1433,
          options: {
            encrypt: false,
            trustServerCertificate: true,
          },
          connectionTimeout: 10000,
          requestTimeout: 30000,
        };

        pool = await sql.connect(dbConfig);
        const result = await pool.request().query(cfg.sql_query);
        data = (result.recordset || []).slice(0, 500); // 最多500行
        if (result.recordset && result.recordset.columns) {
          columns = Object.keys(result.recordset.columns);
        }
        await pool.close();
        pool = null;
      } catch (err) {
        if (pool) {
          try { await pool.close(); } catch (e) { /* ignore */ }
        }
        error = err.originalError?.message || err.message;
        console.error(`[Quality] 查询"${cfg.name}"执行失败:`, error);
      }

      modules[module].push({
        id: cfg.id,
        name: cfg.name,
        display_type: cfg.display_type,
        query_category: cfg.query_category,
        source_name: cfg.source_name,
        columns,
        data,
        error,
      });
    }

    res.json({ code: 200, data: { modules } });
  } catch (err) {
    console.error('[Quality] 加载动态仪表盘数据失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// 保留旧接口兼容
router.get('/records', authMiddleware, (req, res) => {
  res.json({ code: 200, data: [], total: 0 });
});

router.get('/stats', authMiddleware, (req, res) => {
  res.json({ code: 200, data: { avg_tat: 0, pass_rate: 0, total_samples: 0 } });
});

module.exports = router;
