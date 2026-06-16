const express = require('express');
const sql = require('mssql');
const { query } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ============================================
// GET /api/hr/personnel — 人员列表（搜索 + 日期筛选）
// ============================================
router.get('/personnel', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { search, date_from, date_to } = req.query;

    // 日期范围校验
    if (date_from && date_to && date_from > date_to) {
      return res.status(400).json({ code: 400, message: '开始日期不能晚于结束日期' });
    }

    let sqlStr = `SELECT * FROM personnel WHERE group_id = @p0`;
    const params = [groupId];
    const types = [sql.Int];
    let pIdx = 1;

    if (search && search.trim()) {
      const kw = `%${search.trim()}%`;
      sqlStr += ` AND name LIKE @p${pIdx}`;
      params.push(kw);
      types.push(undefined);
      pIdx++;
    }

    if (date_from) {
      sqlStr += ` AND hire_date >= @p${pIdx}`;
      params.push(date_from);
      types.push(undefined);
      pIdx++;
    }

    if (date_to) {
      sqlStr += ` AND hire_date <= @p${pIdx}`;
      params.push(date_to);
      types.push(undefined);
      pIdx++;
    }

    sqlStr += ' ORDER BY id DESC';

    const result = await query(sqlStr, params, types);
    res.json({ code: 200, data: result.recordset, total: result.recordset.length });
  } catch (err) {
    console.error('[HR] 获取人员列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ============================================
// GET /api/hr/personnel/:id — 人员详情
// ============================================
router.get('/personnel/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const result = await query(
      'SELECT * FROM personnel WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '人员不存在' });
    }

    res.json({ code: 200, data: result.recordset[0] });
  } catch (err) {
    console.error('[HR] 获取人员详情失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ============================================
// POST /api/hr/personnel — 新增人员
// ============================================
router.post('/personnel', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { name, age, gender, phone, id_card, hire_date, title, photo } = req.body;

    // 校验必填字段
    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '姓名不能为空' });
    }
    if (!gender) {
      return res.status(400).json({ code: 400, message: '性别不能为空' });
    }

    await query(
      `INSERT INTO personnel (name, age, gender, phone, id_card, hire_date, title, group_id, photo)
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8)`,
      [
        name.trim(),
        age ? parseInt(age, 10) : null,
        gender,
        phone?.trim() || null,
        id_card?.trim() || null,
        hire_date || null,
        title?.trim() || null,
        groupId,
        photo || null
      ],
      [undefined, sql.Int, undefined, undefined, undefined, undefined, undefined, sql.Int, undefined]
    );

    res.json({ code: 200, message: '人员添加成功' });
  } catch (err) {
    console.error('[HR] 新增人员失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ============================================
// PUT /api/hr/personnel/:id — 更新人员
// ============================================
router.put('/personnel/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;
    const { name, age, gender, phone, id_card, hire_date, title, photo } = req.body;

    // 校验必填字段
    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '姓名不能为空' });
    }
    if (!gender) {
      return res.status(400).json({ code: 400, message: '性别不能为空' });
    }

    // 检查记录存在
    const check = await query(
      'SELECT id FROM personnel WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (check.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '人员不存在' });
    }

    await query(
      `UPDATE personnel
       SET name = @p0, age = @p1, gender = @p2, phone = @p3, id_card = @p4,
           hire_date = @p5, title = @p6, photo = @p7, updated_at = GETDATE()
       WHERE id = @p8 AND group_id = @p9`,
      [
        name.trim(),
        age ? parseInt(age, 10) : null,
        gender,
        phone?.trim() || null,
        id_card?.trim() || null,
        hire_date || null,
        title?.trim() || null,
        photo || null,
        id,
        groupId
      ],
      [undefined, sql.Int, undefined, undefined, undefined, undefined, undefined, undefined, sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '人员更新成功' });
  } catch (err) {
    console.error('[HR] 更新人员失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ============================================
// DELETE /api/hr/personnel/:id — 删除人员
// ============================================
router.delete('/personnel/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const check = await query(
      'SELECT id FROM personnel WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (check.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '人员不存在' });
    }

    await query(
      'DELETE FROM personnel WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '人员删除成功' });
  } catch (err) {
    console.error('[HR] 删除人员失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

module.exports = router;
