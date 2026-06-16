const express = require('express');
const sql = require('mssql');
const { query } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');
const { encryptPassword, decryptPassword } = require('../utils/crypto');

const router = express.Router();

// ============================================
// 数据库连接源 — CRUD
// ============================================

// GET /api/monitor-config/sources — 数据源列表（支持搜索，不返回密码）
router.get('/sources', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { search } = req.query;

    let sqlStr = 'SELECT id, name, server, port, database_name, username, is_active, created_at, updated_at FROM tat_db_sources WHERE group_id = @p0';
    const params = [groupId];

    if (search && search.trim()) {
      const kw = `%${search.trim()}%`;
      sqlStr += ` AND (name LIKE @p1 OR server LIKE @p2)`;
      params.push(kw, kw);
    }

    sqlStr += ' ORDER BY id DESC';

    const result = await query(sqlStr, params, [sql.Int]);
    res.json({ code: 200, data: result.recordset, total: result.recordset.length });
  } catch (err) {
    console.error('[Monitor-Config] 获取数据源列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// POST /api/monitor-config/sources — 新建数据源
router.post('/sources', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { name, server, port, database_name, username, password, is_active } = req.body;

    // 验证必填字段
    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '连接名称不能为空' });
    }
    if (!server || !server.trim()) {
      return res.status(400).json({ code: 400, message: '服务器地址不能为空' });
    }
    if (!database_name || !database_name.trim()) {
      return res.status(400).json({ code: 400, message: '数据库名称不能为空' });
    }
    if (!username || !username.trim()) {
      return res.status(400).json({ code: 400, message: '用户名不能为空' });
    }
    if (!password) {
      return res.status(400).json({ code: 400, message: '密码不能为空' });
    }

    const passwordEnc = encryptPassword(password);
    const active = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    await query(
      `INSERT INTO tat_db_sources (name, server, port, database_name, username, password_enc, is_active, group_id)
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7)`,
      [
        name.trim(),
        server.trim(),
        parseInt(port, 10) || 1433,
        database_name.trim(),
        username.trim(),
        passwordEnc,
        active,
        groupId,
      ],
      [undefined, undefined, sql.Int, undefined, undefined, undefined, sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '数据源添加成功' });
  } catch (err) {
    console.error('[Monitor-Config] 新增数据源失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// GET /api/monitor-config/sources/:id — 数据源详情（解密返回明文密码）
router.get('/sources/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const result = await query(
      'SELECT * FROM tat_db_sources WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '数据源不存在' });
    }

    const row = result.recordset[0];
    // 解密密码返回明文
    row.password = decryptPassword(row.password_enc);
    delete row.password_enc;

    res.json({ code: 200, data: row });
  } catch (err) {
    console.error('[Monitor-Config] 获取数据源详情失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// PUT /api/monitor-config/sources/:id — 更新数据源
router.put('/sources/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;
    const { name, server, port, database_name, username, password, is_active } = req.body;

    // 检查存在性
    const existCheck = await query(
      'SELECT id, password_enc FROM tat_db_sources WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (existCheck.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '数据源不存在' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '连接名称不能为空' });
    }
    if (!server || !server.trim()) {
      return res.status(400).json({ code: 400, message: '服务器地址不能为空' });
    }
    if (!database_name || !database_name.trim()) {
      return res.status(400).json({ code: 400, message: '数据库名称不能为空' });
    }
    if (!username || !username.trim()) {
      return res.status(400).json({ code: 400, message: '用户名不能为空' });
    }

    const active = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    // 如果提供了新密码则重新加密，否则保留原密码
    if (password && password.trim()) {
      const passwordEnc = encryptPassword(password);
      await query(
        `UPDATE tat_db_sources SET name=@p0, server=@p1, port=@p2, database_name=@p3, username=@p4, password_enc=@p5, is_active=@p6, updated_at=GETDATE()
         WHERE id=@p7 AND group_id=@p8`,
        [name.trim(), server.trim(), parseInt(port, 10) || 1433, database_name.trim(), username.trim(), passwordEnc, active, id, groupId],
        [undefined, undefined, sql.Int, undefined, undefined, undefined, sql.Int, sql.Int, sql.Int]
      );
    } else {
      await query(
        `UPDATE tat_db_sources SET name=@p0, server=@p1, port=@p2, database_name=@p3, username=@p4, is_active=@p5, updated_at=GETDATE()
         WHERE id=@p6 AND group_id=@p7`,
        [name.trim(), server.trim(), parseInt(port, 10) || 1433, database_name.trim(), username.trim(), active, id, groupId],
        [undefined, undefined, sql.Int, undefined, undefined, sql.Int, sql.Int, sql.Int]
      );
    }

    res.json({ code: 200, message: '数据源更新成功' });
  } catch (err) {
    console.error('[Monitor-Config] 更新数据源失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// DELETE /api/monitor-config/sources/:id — 删除数据源（检查是否有子查询配置）
router.delete('/sources/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const existCheck = await query(
      'SELECT id FROM tat_db_sources WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (existCheck.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '数据源不存在' });
    }

    // 检查关联的查询配置
    const refCheck = await query(
      'SELECT COUNT(*) AS cnt FROM tat_query_configs WHERE source_id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (refCheck.recordset[0].cnt > 0) {
      return res.status(400).json({
        code: 400,
        message: `该数据源下存在 ${refCheck.recordset[0].cnt} 个查询配置，请先删除相关查询配置`,
      });
    }

    await query(
      'DELETE FROM tat_db_sources WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '数据源删除成功' });
  } catch (err) {
    console.error('[Monitor-Config] 删除数据源失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// POST /api/monitor-config/sources/test — 测试数据库连接
router.post('/sources/test', authMiddleware, async (req, res) => {
  let pool = null;
  try {
    const { server, port, database_name, username, password } = req.body;

    if (!server || !database_name || !username || !password) {
      return res.status(400).json({ code: 400, message: '请填写完整的连接信息' });
    }

    const config = {
      user: username,
      password: password,
      server: server,
      database: database_name,
      port: parseInt(port, 10) || 1433,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
      connectionTimeout: 10000,
      requestTimeout: 10000,
    };

    const startTime = Date.now();
    pool = await sql.connect(config);
    const latency = Date.now() - startTime;

    await pool.close();
    pool = null;

    res.json({ code: 200, message: '连接成功', data: { latency_ms: latency } });
  } catch (err) {
    if (pool) {
      try { await pool.close(); } catch (e) { /* ignore */ }
    }
    console.error('[Monitor-Config] 测试连接失败:', err.message);
    res.status(400).json({ code: 400, message: '连接失败: ' + (err.originalError?.message || err.message) });
  }
});

// ============================================
// SQL查询配置 — CRUD
// ============================================

// GET /api/monitor-config/queries — 查询配置列表（支持筛选）
router.get('/queries', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { source_id, search } = req.query;

    let sqlStr = `
      SELECT q.*, s.name AS source_name
      FROM tat_query_configs q
      LEFT JOIN tat_db_sources s ON q.source_id = s.id
      WHERE q.group_id = @p0`;
    const params = [groupId];

    if (source_id) {
      sqlStr += ' AND q.source_id = @p1';
      params.push(parseInt(source_id, 10));
    }

    if (search && search.trim()) {
      const kw = `%${search.trim()}%`;
      const pIdx = params.length;
      sqlStr += ` AND (q.name LIKE @p${pIdx} OR q.query_category LIKE @p${pIdx + 1})`;
      params.push(kw, kw);
    }

    sqlStr += ' ORDER BY q.id DESC';

    const result = await query(sqlStr, params, [sql.Int]);
    res.json({ code: 200, data: result.recordset, total: result.recordset.length });
  } catch (err) {
    console.error('[Monitor-Config] 获取查询配置列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// POST /api/monitor-config/queries — 新建查询配置
router.post('/queries', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { source_id, name, sql_query, query_category, target_module, is_active } = req.body;

    if (!source_id) {
      return res.status(400).json({ code: 400, message: '请选择数据源' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '查询名称不能为空' });
    }
    if (!sql_query || !sql_query.trim()) {
      return res.status(400).json({ code: 400, message: 'SQL查询语句不能为空' });
    }

    // 验证数据源存在且属于本组
    const srcCheck = await query(
      'SELECT id FROM tat_db_sources WHERE id = @p0 AND group_id = @p1',
      [parseInt(source_id, 10), groupId],
      [sql.Int, sql.Int]
    );
    if (srcCheck.recordset.length === 0) {
      return res.status(400).json({ code: 400, message: '所选数据源不存在' });
    }

    const active = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    await query(
      `INSERT INTO tat_query_configs (source_id, name, sql_query, query_category, target_module, is_active, group_id)
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6)`,
      [
        parseInt(source_id, 10),
        name.trim(),
        sql_query.trim(),
        query_category ? query_category.trim() : null,
        target_module || null,
        active,
        groupId,
      ],
      [sql.Int, undefined, undefined, undefined, undefined, sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '查询配置添加成功' });
  } catch (err) {
    console.error('[Monitor-Config] 新增查询配置失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// GET /api/monitor-config/queries/:id — 查询配置详情
router.get('/queries/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const result = await query(
      `SELECT q.*, s.name AS source_name
       FROM tat_query_configs q
       LEFT JOIN tat_db_sources s ON q.source_id = s.id
       WHERE q.id = @p0 AND q.group_id = @p1`,
      [id, groupId],
      [sql.Int, sql.Int]
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '查询配置不存在' });
    }

    res.json({ code: 200, data: result.recordset[0] });
  } catch (err) {
    console.error('[Monitor-Config] 获取查询配置详情失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// PUT /api/monitor-config/queries/:id — 更新查询配置
router.put('/queries/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;
    const { source_id, name, sql_query, query_category, target_module, is_active } = req.body;

    const existCheck = await query(
      'SELECT id FROM tat_query_configs WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (existCheck.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '查询配置不存在' });
    }

    if (!source_id) {
      return res.status(400).json({ code: 400, message: '请选择数据源' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '查询名称不能为空' });
    }
    if (!sql_query || !sql_query.trim()) {
      return res.status(400).json({ code: 400, message: 'SQL查询语句不能为空' });
    }

    const srcCheck = await query(
      'SELECT id FROM tat_db_sources WHERE id = @p0 AND group_id = @p1',
      [parseInt(source_id, 10), groupId],
      [sql.Int, sql.Int]
    );
    if (srcCheck.recordset.length === 0) {
      return res.status(400).json({ code: 400, message: '所选数据源不存在' });
    }

    const active = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    await query(
      `UPDATE tat_query_configs SET source_id=@p0, name=@p1, sql_query=@p2, query_category=@p3, target_module=@p4, is_active=@p5, updated_at=GETDATE()
       WHERE id=@p6 AND group_id=@p7`,
      [parseInt(source_id, 10), name.trim(), sql_query.trim(), query_category ? query_category.trim() : null, target_module || null, active, id, groupId],
      [sql.Int, undefined, undefined, undefined, undefined, sql.Int, sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '查询配置更新成功' });
  } catch (err) {
    console.error('[Monitor-Config] 更新查询配置失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// DELETE /api/monitor-config/queries/:id — 删除查询配置
router.delete('/queries/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const existCheck = await query(
      'SELECT id FROM tat_query_configs WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (existCheck.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '查询配置不存在' });
    }

    await query(
      'DELETE FROM tat_query_configs WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '查询配置删除成功' });
  } catch (err) {
    console.error('[Monitor-Config] 删除查询配置失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// POST /api/monitor-config/queries/test — 测试查询执行
router.post('/queries/test', authMiddleware, async (req, res) => {
  let pool = null;
  try {
    const groupId = req.user.group_id;
    const { source_id, sql_query } = req.body;

    if (!source_id) {
      return res.status(400).json({ code: 400, message: '请选择数据源' });
    }
    if (!sql_query || !sql_query.trim()) {
      return res.status(400).json({ code: 400, message: 'SQL查询语句不能为空' });
    }

    // 加载数据源
    const srcResult = await query(
      'SELECT * FROM tat_db_sources WHERE id = @p0 AND group_id = @p1',
      [parseInt(source_id, 10), groupId],
      [sql.Int, sql.Int]
    );
    if (srcResult.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '数据源不存在' });
    }

    const src = srcResult.recordset[0];
    const password = decryptPassword(src.password_enc);

    const config = {
      user: src.username,
      password: password,
      server: src.server,
      database: src.database_name,
      port: src.port || 1433,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
      connectionTimeout: 10000,
      requestTimeout: 30000,
    };

    pool = await sql.connect(config);
    const result = await pool.request().query(sql_query.trim());
    await pool.close();
    pool = null;

    // 限制返回前100行
    const rows = result.recordset || [];
    const limited = rows.slice(0, 100);

    res.json({
      code: 200,
      message: '查询执行成功',
      data: {
        recordset: limited,
        rowCount: rows.length,
        truncated: rows.length > 100,
      },
    });
  } catch (err) {
    if (pool) {
      try { await pool.close(); } catch (e) { /* ignore */ }
    }
    console.error('[Monitor-Config] 测试查询失败:', err.message);
    res.status(400).json({ code: 400, message: '查询执行失败: ' + (err.originalError?.message || err.message) });
  }
});

module.exports = router;
