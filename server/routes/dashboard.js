const express = require('express');
const sql = require('mssql');
const { query } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/summary — 仪表盘汇总（按当前小组过滤，查询真实数据）
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const { group_id, group_name } = req.user;

    // 仪器数量
    const eqResult = await query(
      'SELECT COUNT(*) AS cnt FROM instruments WHERE group_id = @p0',
      [group_id],
      [sql.Int]
    );
    const equipment_count = eqResult.recordset[0].cnt;

    // 在岗人员数（属于当前小组的用户数）
    const personResult = await query(
      'SELECT COUNT(*) AS cnt FROM user_groups WHERE group_id = @p0',
      [group_id],
      [sql.Int]
    );
    const personnel_count = personResult.recordset[0].cnt;

    res.json({
      code: 200,
      data: {
        group_name,
        group_id,
        personnel_count,
        equipment_count,
        consumables_count: 0,
        documents_count: 0,
        environment_records: 0,
        risk_items: 0,
        tat_pending: 0,
      },
    });
  } catch (err) {
    console.error('[Dashboard] 获取汇总数据失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

module.exports = router;
