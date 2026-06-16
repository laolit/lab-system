/**
 * 环境设施与洁净合规 — 温湿度记录 CRUD
 */
const express = require('express');
const sql = require('mssql');
const { query } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ========== GET /threcords — 列表查询 ==========
router.get('/threcords', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { search, date_from, date_to } = req.query;

    if (date_from && date_to && date_from > date_to) {
      return res.status(400).json({ code: 400, message: '开始日期不能晚于结束日期' });
    }

    let sqlStr = 'SELECT * FROM th_records WHERE group_id = @p0';
    const params = [groupId];
    const types = [sql.Int];
    let pIdx = 1;

    if (search && search.trim()) {
      const kw = `%${search.trim()}%`;
      sqlStr += ` AND (recorder LIKE @p${pIdx} OR remarks LIKE @p${pIdx + 1} OR location LIKE @p${pIdx + 2})`;
      params.push(kw, kw, kw);
      types.push(undefined, undefined, undefined);
      pIdx += 3;
    }
    if (date_from) {
      sqlStr += ` AND record_date >= @p${pIdx}`;
      params.push(date_from);
      types.push(undefined);
      pIdx++;
    }
    if (date_to) {
      sqlStr += ` AND record_date <= @p${pIdx}`;
      params.push(date_to);
      types.push(undefined);
      pIdx++;
    }

    sqlStr += ' ORDER BY record_date DESC, period ASC, id DESC';
    const result = await query(sqlStr, params, types);
    res.json({ code: 200, data: result.recordset, total: result.recordset.length });
  } catch (err) {
    console.error('[Environment] 获取温湿度记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ========== GET /threcords/date/:date — 按日期查询（返回上/下午两条记录，供弹窗编辑模式） ==========
// 注意：此路由必须在 /:id 之前注册，避免 Express 把 "date" 当成 :id
router.get('/threcords/date/:date', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { date } = req.params;
    const result = await query(
      'SELECT * FROM th_records WHERE record_date = @p0 AND group_id = @p1 ORDER BY period ASC',
      [date, groupId],
      [undefined, sql.Int]
    );
    // 返回数组：[上午记录, 下午记录]（可能为空数组、1条或2条）
    res.json({ code: 200, data: result.recordset });
  } catch (err) {
    console.error('[Environment] 按日期查询温湿度记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ========== GET /threcords/:id — 单条详情 ==========
router.get('/threcords/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, message: '无效的记录ID' });
    }
    const groupId = req.user.group_id;
    const result = await query(
      'SELECT * FROM th_records WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (result.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '记录不存在' });
    }
    res.json({ code: 200, data: result.recordset[0] });
  } catch (err) {
    console.error('[Environment] 获取温湿度记录详情失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ========== POST /threcords — 新增 ==========
router.post('/threcords', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { record_date, period, temperature, humidity, location, recorder, remarks } = req.body;

    if (!record_date) return res.status(400).json({ code: 400, message: '请选择记录日期' });
    if (!period) return res.status(400).json({ code: 400, message: '请选择时段（上午/下午）' });

    await query(
      `INSERT INTO th_records (record_date, period, temperature, humidity, location, recorder, remarks, group_id)
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7)`,
      [
        record_date,
        period,
        temperature != null && temperature !== '' ? parseFloat(temperature) : null,
        humidity != null && humidity !== '' ? parseFloat(humidity) : null,
        location || null,
        recorder || null,
        remarks || null,
        groupId
      ],
      [undefined, undefined, undefined, undefined, undefined, undefined, undefined, sql.Int]
    );
    res.json({ code: 200, message: '温湿度记录添加成功' });
  } catch (err) {
    console.error('[Environment] 新增温湿度记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ========== PUT /threcords/:id — 更新 ==========
router.put('/threcords/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, message: '无效的记录ID' });
    }
    const groupId = req.user.group_id;
    const { record_date, period, temperature, humidity, location, recorder, remarks } = req.body;

    // 检查记录是否存在
    const check = await query(
      'SELECT id FROM th_records WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (check.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '记录不存在' });
    }

    if (!record_date) return res.status(400).json({ code: 400, message: '请选择记录日期' });
    if (!period) return res.status(400).json({ code: 400, message: '请选择时段（上午/下午）' });

    await query(
      `UPDATE th_records
       SET record_date = @p0, period = @p1, temperature = @p2, humidity = @p3,
           location = @p4, recorder = @p5, remarks = @p6, updated_at = GETDATE()
       WHERE id = @p7 AND group_id = @p8`,
      [
        record_date,
        period,
        temperature != null && temperature !== '' ? parseFloat(temperature) : null,
        humidity != null && humidity !== '' ? parseFloat(humidity) : null,
        location || null,
        recorder || null,
        remarks || null,
        id,
        groupId
      ],
      [undefined, undefined, undefined, undefined, undefined, undefined, undefined, sql.Int, sql.Int]
    );
    res.json({ code: 200, message: '温湿度记录更新成功' });
  } catch (err) {
    console.error('[Environment] 更新温湿度记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ========== DELETE /threcords/:id — 删除 ==========
router.delete('/threcords/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, message: '无效的记录ID' });
    }
    const groupId = req.user.group_id;

    const check = await query(
      'SELECT id FROM th_records WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (check.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '记录不存在' });
    }

    await query(
      'DELETE FROM th_records WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    res.json({ code: 200, message: '温湿度记录删除成功' });
  } catch (err) {
    console.error('[Environment] 删除温湿度记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

module.exports = router;
