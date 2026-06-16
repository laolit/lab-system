const express = require('express');
const sql = require('mssql');
const { query } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ============================================
// 设备台账 — 仪器 CRUD
// ============================================

// GET /api/equipment/instruments — 仪器列表（支持搜索）
router.get('/instruments', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { search } = req.query;

    let sql = 'SELECT * FROM instruments WHERE group_id = @p0';
    const params = [groupId];

    if (search && search.trim()) {
      sql += ' AND (name LIKE @p1 OR model LIKE @p2 OR serial_number LIKE @p3 OR manufacturer LIKE @p4)';
      const kw = `%${search.trim()}%`;
      params.push(kw, kw, kw, kw);
    }

    sql += ' ORDER BY id DESC';

    const result = await query(sql, params, [sql.Int]);
    res.json({ code: 200, data: result.recordset, total: result.recordset.length });
  } catch (err) {
    console.error('[Equipment] 获取仪器列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// GET /api/equipment/instruments/:id — 仪器详情
router.get('/instruments/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const result = await query(
      'SELECT * FROM instruments WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '仪器不存在' });
    }

    res.json({ code: 200, data: result.recordset[0] });
  } catch (err) {
    console.error('[Equipment] 获取仪器详情失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// POST /api/equipment/instruments — 新增仪器
router.post('/instruments', authMiddleware, async (req, res) => {
  try {
    // admin 可从 body 指定 group_id，非 admin 强制使用当前小组
    const groupId = (req.user.role === 'admin' && req.body.group_id)
      ? parseInt(req.body.group_id, 10)
      : req.user.group_id;
    const { name, model, serial_number, manufacturer, purchase_date, add_date, status, location, contact_person, remarks, daily_maintenance, weekly_maintenance, monthly_maintenance } = req.body;

    // 验证必填字段
    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '仪器名称不能为空' });
    }
    if (!model || !model.trim()) {
      return res.status(400).json({ code: 400, message: '仪器型号不能为空' });
    }
    if (!manufacturer || !manufacturer.trim()) {
      return res.status(400).json({ code: 400, message: '仪器厂商不能为空' });
    }

    const insertTypes = new Array(14);
    insertTypes[13] = sql.Int;  // group_id
    await query(
      `INSERT INTO instruments (name, model, serial_number, manufacturer, purchase_date, add_date, status, location, contact_person, remarks, daily_maintenance, weekly_maintenance, monthly_maintenance, group_id)
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13)`,
      [
        name.trim(),
        model.trim(),
        serial_number ? serial_number.trim() : null,
        manufacturer.trim(),
        purchase_date || null,
        add_date || null,
        status || 'in_use',
        location ? location.trim() : null,
        contact_person ? contact_person.trim() : null,
        remarks ? remarks.trim() : null,
        daily_maintenance ? daily_maintenance.trim() : null,
        weekly_maintenance ? weekly_maintenance.trim() : null,
        monthly_maintenance ? monthly_maintenance.trim() : null,
        groupId,
      ],
      insertTypes
    );

    res.json({ code: 200, message: '仪器添加成功' });
  } catch (err) {
    console.error('[Equipment] 新增仪器失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// PUT /api/equipment/instruments/:id — 更新仪器
router.put('/instruments/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const currentGroupId = req.user.group_id;
    // admin 可从 body 指定 group_id 用于跨组迁移
    const targetGroupId = (req.user.role === 'admin' && req.body.group_id)
      ? parseInt(req.body.group_id, 10)
      : currentGroupId;
    const { name, model, serial_number, manufacturer, purchase_date, add_date, status, location, contact_person, remarks, daily_maintenance, weekly_maintenance, monthly_maintenance } = req.body;

    // 验证必填字段
    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '仪器名称不能为空' });
    }
    if (!model || !model.trim()) {
      return res.status(400).json({ code: 400, message: '仪器型号不能为空' });
    }
    if (!manufacturer || !manufacturer.trim()) {
      return res.status(400).json({ code: 400, message: '仪器厂商不能为空' });
    }

    // 验证仪器是否存在（admin 可跨组操作，非 admin 限定当前小组）
    let checkSql, checkParams, checkTypes;
    if (req.user.role === 'admin') {
      checkSql = 'SELECT id FROM instruments WHERE id = @p0';
      checkParams = [id];
      checkTypes = [sql.Int];
    } else {
      checkSql = 'SELECT id FROM instruments WHERE id = @p0 AND group_id = @p1';
      checkParams = [id, currentGroupId];
      checkTypes = [sql.Int, sql.Int];
    }
    const check = await query(checkSql, checkParams, checkTypes);
    if (check.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '仪器不存在' });
    }

    // UPDATE（admin 跨组时不校验当前 group_id）
    const updateTypes = new Array(15);
    updateTypes[13] = sql.Int;  // id
    updateTypes[14] = sql.Int;  // targetGroupId
    const updateWhere = (req.user.role === 'admin')
      ? 'WHERE id = @p13'       // admin 跨组：只按 id 定位
      : 'WHERE id = @p13 AND group_id = @p14';  // 非 admin：限定小组
    await query(
      `UPDATE instruments
       SET name = @p0, model = @p1, serial_number = @p2, manufacturer = @p3,
           purchase_date = @p4, add_date = @p5, status = @p6,
           location = @p7, contact_person = @p8, remarks = @p9,
           daily_maintenance = @p10, weekly_maintenance = @p11, monthly_maintenance = @p12,
           group_id = @p14, updated_at = GETDATE()
       ${updateWhere}`,
      [
        name.trim(),
        model.trim(),
        serial_number ? serial_number.trim() : null,
        manufacturer.trim(),
        purchase_date || null,
        add_date || null,
        status || 'in_use',
        location ? location.trim() : null,
        contact_person ? contact_person.trim() : null,
        remarks ? remarks.trim() : null,
        daily_maintenance ? daily_maintenance.trim() : null,
        weekly_maintenance ? weekly_maintenance.trim() : null,
        monthly_maintenance ? monthly_maintenance.trim() : null,
        id,
        targetGroupId,
      ],
      updateTypes
    );

    res.json({ code: 200, message: '仪器更新成功' });
  } catch (err) {
    console.error('[Equipment] 更新仪器失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// DELETE /api/equipment/instruments/:id — 删除仪器
router.delete('/instruments/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    // 验证仪器是否存在（admin 可跨组删除）
    let checkSql, checkParams, checkTypes;
    if (req.user.role === 'admin') {
      checkSql = 'SELECT id FROM instruments WHERE id = @p0';
      checkParams = [id];
      checkTypes = [sql.Int];
    } else {
      checkSql = 'SELECT id FROM instruments WHERE id = @p0 AND group_id = @p1';
      checkParams = [id, groupId];
      checkTypes = [sql.Int, sql.Int];
    }
    const check = await query(checkSql, checkParams, checkTypes);
    if (check.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '仪器不存在' });
    }

    // DELETE（admin 跨组删除时不校验 group_id）
    let delSql, delParams, delTypes;
    if (req.user.role === 'admin') {
      delSql = 'DELETE FROM instruments WHERE id = @p0';
      delParams = [id];
      delTypes = [sql.Int];
    } else {
      delSql = 'DELETE FROM instruments WHERE id = @p0 AND group_id = @p1';
      delParams = [id, groupId];
      delTypes = [sql.Int, sql.Int];
    }
    await query(delSql, delParams, delTypes);

    res.json({ code: 200, message: '仪器删除成功' });
  } catch (err) {
    console.error('[Equipment] 删除仪器失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ============================================
// ============================================
// 日常保养记录 — CRUD
// ============================================

// GET /api/equipment/maintenance — 维护记录列表
router.get('/maintenance', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { search, instrument_id, date_from, date_to } = req.query;

    // 日期范围校验
    if (date_from && date_to && date_from > date_to) {
      return res.status(400).json({ code: 400, message: '开始日期不能晚于结束日期' });
    }

    let sqlStr = `
      SELECT mr.*, i.name AS instrument_name, i.model AS instrument_model
      FROM maintenance_records mr
      INNER JOIN instruments i ON mr.instrument_id = i.id
      WHERE mr.group_id = @p0`;
    const params = [groupId];
    const types = [sql.Int];
    let pIdx = 1;

    if (instrument_id) {
      sqlStr += ` AND mr.instrument_id = @p${pIdx}`;
      params.push(parseInt(instrument_id, 10));
      types.push(sql.Int);
      pIdx++;
    } else if (search && search.trim()) {
      const kw = `%${search.trim()}%`;
      sqlStr += ` AND (i.name LIKE @p${pIdx} OR i.model LIKE @p${pIdx + 1} OR mr.performed_by LIKE @p${pIdx + 2})`;
      params.push(kw, kw, kw);
      types.push(undefined, undefined, undefined);
      pIdx += 3;
    }

    if (date_from) {
      sqlStr += ` AND mr.maintenance_date >= @p${pIdx}`;
      params.push(date_from);
      types.push(undefined);
      pIdx++;
    }

    if (date_to) {
      sqlStr += ` AND mr.maintenance_date <= @p${pIdx}`;
      params.push(date_to);
      types.push(undefined);
      pIdx++;
    }

    sqlStr += ' ORDER BY mr.maintenance_date DESC, mr.id DESC';

    const result = await query(sqlStr, params, types);
    res.json({ code: 200, data: result.recordset, total: result.recordset.length });
  } catch (err) {
    console.error('[Equipment] 获取维护记录列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// GET /api/equipment/maintenance/:id — 维护记录详情
router.get('/maintenance/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const result = await query(
      `SELECT mr.*, i.name AS instrument_name, i.model AS instrument_model
       FROM maintenance_records mr
       INNER JOIN instruments i ON mr.instrument_id = i.id
       WHERE mr.id = @p0 AND mr.group_id = @p1`,
      [id, groupId],
      [sql.Int, sql.Int]
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '维护记录不存在' });
    }

    res.json({ code: 200, data: result.recordset[0] });
  } catch (err) {
    console.error('[Equipment] 获取维护记录详情失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// POST /api/equipment/maintenance — 新增维护记录
router.post('/maintenance', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { instrument_id, maintenance_date, maintenance_type, performed_by, maintenance_content, remarks } = req.body;

    // 验证必填字段
    if (!instrument_id) {
      return res.status(400).json({ code: 400, message: '请选择仪器' });
    }
    if (!maintenance_date) {
      return res.status(400).json({ code: 400, message: '请选择保养日期' });
    }
    if (!maintenance_type || !maintenance_type.trim()) {
      return res.status(400).json({ code: 400, message: '请选择保养类型' });
    }
    if (!performed_by || !performed_by.trim()) {
      return res.status(400).json({ code: 400, message: '执行人不能为空' });
    }

    // 验证仪器存在且属于本组
    const instCheck = await query(
      'SELECT id FROM instruments WHERE id = @p0 AND group_id = @p1',
      [parseInt(instrument_id, 10), groupId],
      [sql.Int, sql.Int]
    );
    if (instCheck.recordset.length === 0) {
      return res.status(400).json({ code: 400, message: '所选仪器不存在' });
    }

    await query(
      `INSERT INTO maintenance_records (instrument_id, maintenance_date, maintenance_type, performed_by, maintenance_content, group_id, remarks)
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6)`,
      [
        parseInt(instrument_id, 10),
        maintenance_date,
        maintenance_type.trim(),
        performed_by.trim(),
        maintenance_content ? maintenance_content.trim() : null,
        groupId,
        remarks ? remarks.trim() : null,
      ],
      [sql.Int, undefined, undefined, undefined, undefined, sql.Int, undefined]
    );

    res.json({ code: 200, message: '维护记录添加成功' });
  } catch (err) {
    console.error('[Equipment] 新增维护记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// PUT /api/equipment/maintenance/:id — 更新维护记录
router.put('/maintenance/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;
    const { instrument_id, maintenance_date, maintenance_type, performed_by, maintenance_content, remarks } = req.body;

    // 验证必填字段
    if (!instrument_id) {
      return res.status(400).json({ code: 400, message: '请选择仪器' });
    }
    if (!maintenance_date) {
      return res.status(400).json({ code: 400, message: '请选择保养日期' });
    }
    if (!maintenance_type || !maintenance_type.trim()) {
      return res.status(400).json({ code: 400, message: '请选择保养类型' });
    }
    if (!performed_by || !performed_by.trim()) {
      return res.status(400).json({ code: 400, message: '执行人不能为空' });
    }

    // 验证记录存在且属于本组
    const check = await query(
      'SELECT id FROM maintenance_records WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (check.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '维护记录不存在' });
    }

    // 验证新仪器存在且属于本组
    const instCheck = await query(
      'SELECT id FROM instruments WHERE id = @p0 AND group_id = @p1',
      [parseInt(instrument_id, 10), groupId],
      [sql.Int, sql.Int]
    );
    if (instCheck.recordset.length === 0) {
      return res.status(400).json({ code: 400, message: '所选仪器不存在' });
    }

    await query(
      `UPDATE maintenance_records
       SET instrument_id = @p0, maintenance_date = @p1, maintenance_type = @p2,
           performed_by = @p3, maintenance_content = @p4, remarks = @p5, updated_at = GETDATE()
       WHERE id = @p6 AND group_id = @p7`,
      [
        parseInt(instrument_id, 10),
        maintenance_date,
        maintenance_type.trim(),
        performed_by.trim(),
        maintenance_content ? maintenance_content.trim() : null,
        remarks ? remarks.trim() : null,
        id,
        groupId,
      ],
      [sql.Int, undefined, undefined, undefined, undefined, undefined, sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '维护记录更新成功' });
  } catch (err) {
    console.error('[Equipment] 更新维护记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// DELETE /api/equipment/maintenance/:id — 删除维护记录
router.delete('/maintenance/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const check = await query(
      'SELECT id FROM maintenance_records WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (check.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '维护记录不存在' });
    }

    await query(
      'DELETE FROM maintenance_records WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '维护记录删除成功' });
  } catch (err) {
    console.error('[Equipment] 删除维护记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ============================================
// 使用登记记录 — CRUD
// ============================================

// GET /api/equipment/usage — 使用登记记录列表
router.get('/usage', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { search, date_from, date_to } = req.query;

    // 日期范围校验
    if (date_from && date_to && date_from > date_to) {
      return res.status(400).json({ code: 400, message: '开始日期不能晚于结束日期' });
    }

    let sqlStr = `
      SELECT ur.*, i.name AS instrument_name, i.model AS instrument_model
      FROM usage_records ur
      INNER JOIN instruments i ON ur.instrument_id = i.id
      WHERE ur.group_id = @p0`;
    const params = [groupId];
    const types = [sql.Int];
    let pIdx = 1;

    if (search && search.trim()) {
      sqlStr += ` AND (i.name LIKE @p${pIdx} OR i.model LIKE @p${pIdx+1} OR ur.operator LIKE @p${pIdx+2} OR ur.sample_type LIKE @p${pIdx+3})`;
      const kw = `%${search.trim()}%`;
      params.push(kw, kw, kw, kw);
      types.push(undefined, undefined, undefined, undefined);
      pIdx += 4;
    }

    if (date_from) {
      sqlStr += ` AND ur.usage_date >= @p${pIdx}`;
      params.push(date_from);
      types.push(undefined);
      pIdx++;
    }

    if (date_to) {
      sqlStr += ` AND ur.usage_date <= @p${pIdx}`;
      params.push(date_to);
      types.push(undefined);
      pIdx++;
    }

    sqlStr += ' ORDER BY ur.usage_date DESC, ur.start_time DESC, ur.id DESC';

    const result = await query(sqlStr, params, types);
    res.json({ code: 200, data: result.recordset, total: result.recordset.length });
  } catch (err) {
    console.error('[Equipment] 获取使用登记列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// GET /api/equipment/usage/:id — 使用登记记录详情
router.get('/usage/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const result = await query(
      `SELECT ur.*, i.name AS instrument_name, i.model AS instrument_model
       FROM usage_records ur
       INNER JOIN instruments i ON ur.instrument_id = i.id
       WHERE ur.id = @p0 AND ur.group_id = @p1`,
      [id, groupId],
      [sql.Int, sql.Int]
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '使用登记记录不存在' });
    }

    res.json({ code: 200, data: result.recordset[0] });
  } catch (err) {
    console.error('[Equipment] 获取使用登记详情失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// POST /api/equipment/usage — 新增使用登记记录
router.post('/usage', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { usage_date, start_time, end_time, sample_type, sample_count, instrument_id, usage_function, instrument_status, fault_handling, operator, remarks } = req.body;

    // 验证必填字段
    if (!instrument_id) {
      return res.status(400).json({ code: 400, message: '请选择仪器' });
    }
    if (!usage_date) {
      return res.status(400).json({ code: 400, message: '请选择使用日期' });
    }
    if (!start_time) {
      return res.status(400).json({ code: 400, message: '请选择开始使用时间' });
    }
    if (!operator || !operator.trim()) {
      return res.status(400).json({ code: 400, message: '操作人不能为空' });
    }

    // 验证仪器存在且属于本组
    const instCheck = await query(
      'SELECT id FROM instruments WHERE id = @p0 AND group_id = @p1',
      [parseInt(instrument_id, 10), groupId],
      [sql.Int, sql.Int]
    );
    if (instCheck.recordset.length === 0) {
      return res.status(400).json({ code: 400, message: '所选仪器不存在' });
    }

    await query(
      `INSERT INTO usage_records (usage_date, start_time, end_time, sample_type, sample_count, instrument_id, usage_function, instrument_status, fault_handling, operator, remarks, group_id)
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11)`,
      [
        usage_date,
        start_time,
        end_time || null,
        sample_type ? sample_type.trim() : null,
        sample_count ? parseInt(sample_count, 10) : null,
        parseInt(instrument_id, 10),
        (usage_function && usage_function.trim()) ? usage_function.trim() : '常规',
        (instrument_status && instrument_status.trim()) ? instrument_status.trim() : '常规',
        fault_handling ? fault_handling.trim() : null,
        operator.trim(),
        remarks ? remarks.trim() : null,
        groupId,
      ],
      [undefined, undefined, undefined, undefined, sql.Int, sql.Int, undefined, undefined, undefined, undefined, undefined, sql.Int]
    );

    res.json({ code: 200, message: '使用登记记录添加成功' });
  } catch (err) {
    console.error('[Equipment] 新增使用登记记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// PUT /api/equipment/usage/:id — 更新使用登记记录
router.put('/usage/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;
    const { usage_date, start_time, end_time, sample_type, sample_count, instrument_id, usage_function, instrument_status, fault_handling, operator, remarks } = req.body;

    // 验证必填字段
    if (!instrument_id) {
      return res.status(400).json({ code: 400, message: '请选择仪器' });
    }
    if (!usage_date) {
      return res.status(400).json({ code: 400, message: '请选择使用日期' });
    }
    if (!start_time) {
      return res.status(400).json({ code: 400, message: '请选择开始使用时间' });
    }
    if (!operator || !operator.trim()) {
      return res.status(400).json({ code: 400, message: '操作人不能为空' });
    }

    // 验证记录存在且属于本组
    const check = await query(
      'SELECT id FROM usage_records WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (check.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '使用登记记录不存在' });
    }

    // 验证新仪器存在且属于本组
    const instCheck = await query(
      'SELECT id FROM instruments WHERE id = @p0 AND group_id = @p1',
      [parseInt(instrument_id, 10), groupId],
      [sql.Int, sql.Int]
    );
    if (instCheck.recordset.length === 0) {
      return res.status(400).json({ code: 400, message: '所选仪器不存在' });
    }

    await query(
      `UPDATE usage_records
       SET usage_date = @p0, start_time = @p1, end_time = @p2, sample_type = @p3,
           sample_count = @p4, instrument_id = @p5, usage_function = @p6,
           instrument_status = @p7, fault_handling = @p8, operator = @p9,
           remarks = @p10, updated_at = GETDATE()
       WHERE id = @p11 AND group_id = @p12`,
      [
        usage_date,
        start_time,
        end_time || null,
        sample_type ? sample_type.trim() : null,
        sample_count ? parseInt(sample_count, 10) : null,
        parseInt(instrument_id, 10),
        (usage_function && usage_function.trim()) ? usage_function.trim() : '常规',
        (instrument_status && instrument_status.trim()) ? instrument_status.trim() : '常规',
        fault_handling ? fault_handling.trim() : null,
        operator.trim(),
        remarks ? remarks.trim() : null,
        id,
        groupId,
      ],
      [undefined, undefined, undefined, undefined, sql.Int, sql.Int, undefined, undefined, undefined, undefined, undefined, sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '使用登记记录更新成功' });
  } catch (err) {
    console.error('[Equipment] 更新使用登记记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// DELETE /api/equipment/usage/:id — 删除使用登记记录
router.delete('/usage/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const check = await query(
      'SELECT id FROM usage_records WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (check.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '使用登记记录不存在' });
    }

    await query(
      'DELETE FROM usage_records WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '使用登记记录删除成功' });
  } catch (err) {
    console.error('[Equipment] 删除使用登记记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ============================================
// 维修记录 — CRUD
// ============================================

// GET /api/equipment/repair — 维修记录列表
router.get('/repair', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { search, date_from, date_to } = req.query;

    // 日期范围校验
    if (date_from && date_to && date_from > date_to) {
      return res.status(400).json({ code: 400, message: '开始日期不能晚于结束日期' });
    }

    let sqlStr = `
      SELECT rr.*, i.name AS instrument_name, i.model AS instrument_model
      FROM repair_records rr
      INNER JOIN instruments i ON rr.instrument_id = i.id
      WHERE rr.group_id = @p0`;
    const params = [groupId];
    const types = [sql.Int];
    let pIdx = 1;

    if (search && search.trim()) {
      const kw = `%${search.trim()}%`;
      sqlStr += ` AND (i.name LIKE @p${pIdx} OR i.model LIKE @p${pIdx + 1} OR rr.discoverer LIKE @p${pIdx + 2} OR rr.handler LIKE @p${pIdx + 3})`;
      params.push(kw, kw, kw, kw);
      types.push(undefined, undefined, undefined, undefined);
      pIdx += 4;
    }

    if (date_from) {
      sqlStr += ` AND rr.discovery_time >= @p${pIdx}`;
      params.push(date_from);
      types.push(undefined);
      pIdx++;
    }

    if (date_to) {
      sqlStr += ` AND rr.discovery_time <= @p${pIdx}`;
      params.push(date_to);
      types.push(undefined);
      pIdx++;
    }

    sqlStr += ' ORDER BY rr.discovery_time DESC, rr.id DESC';

    const result = await query(sqlStr, params, types);
    res.json({ code: 200, data: result.recordset, total: result.recordset.length });
  } catch (err) {
    console.error('[Equipment] 获取维修记录列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// GET /api/equipment/repair/:id — 维修记录详情
router.get('/repair/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const result = await query(
      `SELECT rr.*, i.name AS instrument_name, i.model AS instrument_model
       FROM repair_records rr
       INNER JOIN instruments i ON rr.instrument_id = i.id
       WHERE rr.id = @p0 AND rr.group_id = @p1`,
      [id, groupId],
      [sql.Int, sql.Int]
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '维修记录不存在' });
    }

    res.json({ code: 200, data: result.recordset[0] });
  } catch (err) {
    console.error('[Equipment] 获取维修记录详情失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// POST /api/equipment/repair — 新增维修记录
router.post('/repair', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const {
      instrument_id, fault_description, replaced_after_fault, discoverer, discovery_time,
      fault_cause_process, handler, handling_time, need_performance_verification,
      verification_method, verification_person, verification_date,
      need_trace_specimens, traced_situation, untraced_reason, trace_handler, trace_date
    } = req.body;

    // 验证必填字段
    if (!instrument_id) {
      return res.status(400).json({ code: 400, message: '请选择仪器' });
    }
    if (!discoverer || !discoverer.trim()) {
      return res.status(400).json({ code: 400, message: '发现人不能为空' });
    }

    // 验证仪器存在且属于本组
    const instCheck = await query(
      'SELECT id FROM instruments WHERE id = @p0 AND group_id = @p1',
      [parseInt(instrument_id, 10), groupId],
      [sql.Int, sql.Int]
    );
    if (instCheck.recordset.length === 0) {
      return res.status(400).json({ code: 400, message: '所选仪器不存在' });
    }

    await query(
      `INSERT INTO repair_records (instrument_id, fault_description, replaced_after_fault, discoverer, discovery_time, fault_cause_process, handler, handling_time, need_performance_verification, verification_method, verification_person, verification_date, need_trace_specimens, traced_situation, untraced_reason, trace_handler, trace_date, group_id)
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13, @p14, @p15, @p16, @p17)`,
      [
        parseInt(instrument_id, 10),
        fault_description ? fault_description.trim() : null,
        replaced_after_fault || null,
        discoverer.trim(),
        discovery_time || null,
        fault_cause_process ? fault_cause_process.trim() : null,
        handler ? handler.trim() : null,
        handling_time || null,
        need_performance_verification || null,
        verification_method ? verification_method.trim() : null,
        verification_person ? verification_person.trim() : null,
        verification_date || null,
        need_trace_specimens || null,
        traced_situation ? traced_situation.trim() : null,
        untraced_reason ? untraced_reason.trim() : null,
        trace_handler ? trace_handler.trim() : null,
        trace_date || null,
        groupId,
      ],
      [sql.Int, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, sql.Int]
    );

    res.json({ code: 200, message: '维修记录添加成功' });
  } catch (err) {
    console.error('[Equipment] 新增维修记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// PUT /api/equipment/repair/:id — 更新维修记录
router.put('/repair/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;
    const {
      instrument_id, fault_description, replaced_after_fault, discoverer, discovery_time,
      fault_cause_process, handler, handling_time, need_performance_verification,
      verification_method, verification_person, verification_date,
      need_trace_specimens, traced_situation, untraced_reason, trace_handler, trace_date
    } = req.body;

    if (!instrument_id) {
      return res.status(400).json({ code: 400, message: '请选择仪器' });
    }
    if (!discoverer || !discoverer.trim()) {
      return res.status(400).json({ code: 400, message: '发现人不能为空' });
    }

    const check = await query(
      'SELECT id FROM repair_records WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (check.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '维修记录不存在' });
    }

    const instCheck = await query(
      'SELECT id FROM instruments WHERE id = @p0 AND group_id = @p1',
      [parseInt(instrument_id, 10), groupId],
      [sql.Int, sql.Int]
    );
    if (instCheck.recordset.length === 0) {
      return res.status(400).json({ code: 400, message: '所选仪器不存在' });
    }

    await query(
      `UPDATE repair_records
       SET instrument_id = @p0, fault_description = @p1, replaced_after_fault = @p2,
           discoverer = @p3, discovery_time = @p4, fault_cause_process = @p5,
           handler = @p6, handling_time = @p7, need_performance_verification = @p8,
           verification_method = @p9, verification_person = @p10, verification_date = @p11,
           need_trace_specimens = @p12, traced_situation = @p13, untraced_reason = @p14,
           trace_handler = @p15, trace_date = @p16, updated_at = GETDATE()
       WHERE id = @p17 AND group_id = @p18`,
      [
        parseInt(instrument_id, 10),
        fault_description ? fault_description.trim() : null,
        replaced_after_fault || null,
        discoverer.trim(),
        discovery_time || null,
        fault_cause_process ? fault_cause_process.trim() : null,
        handler ? handler.trim() : null,
        handling_time || null,
        need_performance_verification || null,
        verification_method ? verification_method.trim() : null,
        verification_person ? verification_person.trim() : null,
        verification_date || null,
        need_trace_specimens || null,
        traced_situation ? traced_situation.trim() : null,
        untraced_reason ? untraced_reason.trim() : null,
        trace_handler ? trace_handler.trim() : null,
        trace_date || null,
        id,
        groupId,
      ],
      [sql.Int, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '维修记录更新成功' });
  } catch (err) {
    console.error('[Equipment] 更新维修记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// DELETE /api/equipment/repair/:id — 删除维修记录
router.delete('/repair/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const check = await query(
      'SELECT id FROM repair_records WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (check.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '维修记录不存在' });
    }

    await query(
      'DELETE FROM repair_records WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '维修记录删除成功' });
  } catch (err) {
    console.error('[Equipment] 删除维修记录失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ============================================
// 仪器校准报告 — CRUD
// ============================================

// GET /api/equipment/calibration — 校准报告列表（支持搜索，files 不含 base64 data）
router.get('/calibration', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const search = req.query.search || '';

    let sqlStr = `SELECT cr.id, cr.instrument_id, cr.files, cr.report_date, cr.uploader, cr.created_at, cr.updated_at,
      i.name AS instrument_name, i.model AS instrument_model
      FROM calibration_reports cr
      INNER JOIN instruments i ON cr.instrument_id = i.id
      WHERE cr.group_id = @p0`;
    const params = [groupId];
    const types = [sql.Int];

    if (search && search.trim()) {
      sqlStr += ' AND (i.name LIKE @p1 OR i.model LIKE @p2 OR cr.uploader LIKE @p3)';
      const kw = `%${search.trim()}%`;
      params.push(kw, kw, kw);
      types.push(undefined, undefined, undefined);
    }

    sqlStr += ' ORDER BY cr.report_date DESC';
    const result = await query(sqlStr, params, types);

    // 对每条记录解析 files 但只保留元数据（不含 data）
    const list = [];
    for (const row of result.recordset) {
      const item = { ...row };
      // 列表接口不返回 files 字段以减少传输量，前端需要文件名时用详情接口
      // 这里返回 file_count 供表格显示
      let fileCount = 0;
      let fileNames = [];
      try {
        if (row.files) {
          const filesArr = JSON.parse(row.files);
          fileCount = filesArr.length;
          fileNames = filesArr.map(f => f.name);
        }
      } catch (e) { /* ignore parse error */ }
      item.file_count = fileCount;
      item.file_names = fileNames;
      delete item.files; // 列表不返回 files 字段
      list.push(item);
    }

    res.json({ code: 200, data: list, total: list.length });
  } catch (err) {
    console.error('[Equipment] 获取校准报告列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// GET /api/equipment/calibration/:id — 校准报告详情（含文件 base64 数据）
router.get('/calibration/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const result = await query(
      `SELECT cr.*, i.name AS instrument_name, i.model AS instrument_model
       FROM calibration_reports cr
       INNER JOIN instruments i ON cr.instrument_id = i.id
       WHERE cr.id = @p0 AND cr.group_id = @p1`,
      [id, groupId],
      [sql.Int, sql.Int]
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '校准报告不存在' });
    }

    const record = result.recordset[0];
    // 解析 files JSON
    if (record.files) {
      try {
        record.files = JSON.parse(record.files);
      } catch (e) {
        record.files = [];
      }
    } else {
      record.files = [];
    }

    res.json({ code: 200, data: record });
  } catch (err) {
    console.error('[Equipment] 获取校准报告详情失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// POST /api/equipment/calibration — 新增校准报告
router.post('/calibration', authMiddleware, async (req, res) => {
  try {
    const groupId = req.user.group_id;
    const { instrument_id, files, uploader, report_date } = req.body;

    // 入参校验
    if (!instrument_id) {
      return res.status(400).json({ code: 400, message: '请选择仪器' });
    }
    if (!uploader || !uploader.trim()) {
      return res.status(400).json({ code: 400, message: '请填写上传人' });
    }
    if (!report_date) {
      return res.status(400).json({ code: 400, message: '请选择报告日期' });
    }

    // 校验仪器存在且属于当前小组
    const instCheck = await query(
      'SELECT id FROM instruments WHERE id = @p0 AND group_id = @p1',
      [parseInt(instrument_id, 10), groupId],
      [sql.Int, sql.Int]
    );
    if (instCheck.recordset.length === 0) {
      return res.status(400).json({ code: 400, message: '所选仪器不存在' });
    }

    // 校验文件格式（后端二次校验）
    let filesData = null;
    if (files && Array.isArray(files) && files.length > 0) {
      const ALLOWED_TYPES = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      for (const f of files) {
        const mime = f.type || '';
        const isImage = mime.startsWith('image/');
        const isAllowed = ALLOWED_TYPES.includes(mime) || isImage;
        if (!isAllowed) {
          return res.status(400).json({ code: 400, message: `文件 "${f.name}" 格式不支持，仅允许 PDF、Word、图片` });
        }
      }
      filesData = JSON.stringify(files);
    }

    const result = await query(
      `INSERT INTO calibration_reports (instrument_id, files, uploader, report_date, group_id)
       VALUES (@p0, @p1, @p2, @p3, @p4);
       SELECT SCOPE_IDENTITY() AS id;`,
      [
        parseInt(instrument_id, 10),
        filesData,
        uploader.trim(),
        report_date,
        groupId,
      ],
      [sql.Int, undefined, undefined, undefined, sql.Int]
    );

    res.json({ code: 200, message: '校准报告新增成功', data: { id: result.recordset[0].id } });
  } catch (err) {
    console.error('[Equipment] 新增校准报告失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// PUT /api/equipment/calibration/:id — 修改校准报告
router.put('/calibration/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;
    const { instrument_id, files, uploader, report_date } = req.body;

    // 检查记录存在
    const check = await query(
      'SELECT id FROM calibration_reports WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (check.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '校准报告不存在' });
    }

    // 入参校验
    if (!instrument_id) {
      return res.status(400).json({ code: 400, message: '请选择仪器' });
    }
    if (!uploader || !uploader.trim()) {
      return res.status(400).json({ code: 400, message: '请填写上传人' });
    }
    if (!report_date) {
      return res.status(400).json({ code: 400, message: '请选择报告日期' });
    }

    // 校验仪器存在
    const instCheck = await query(
      'SELECT id FROM instruments WHERE id = @p0 AND group_id = @p1',
      [parseInt(instrument_id, 10), groupId],
      [sql.Int, sql.Int]
    );
    if (instCheck.recordset.length === 0) {
      return res.status(400).json({ code: 400, message: '所选仪器不存在' });
    }

    // 校验文件格式
    let filesData = null;
    if (files && Array.isArray(files) && files.length > 0) {
      const ALLOWED_TYPES = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      for (const f of files) {
        const mime = f.type || '';
        const isImage = mime.startsWith('image/');
        const isAllowed = ALLOWED_TYPES.includes(mime) || isImage;
        if (!isAllowed) {
          return res.status(400).json({ code: 400, message: `文件 "${f.name}" 格式不支持，仅允许 PDF、Word、图片` });
        }
      }
      filesData = JSON.stringify(files);
    }

    await query(
      `UPDATE calibration_reports
       SET instrument_id = @p0, files = @p1, uploader = @p2, report_date = @p3, updated_at = GETDATE()
       WHERE id = @p4 AND group_id = @p5`,
      [
        parseInt(instrument_id, 10),
        filesData,
        uploader.trim(),
        report_date,
        id,
        groupId,
      ],
      [sql.Int, undefined, undefined, undefined, sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '校准报告更新成功' });
  } catch (err) {
    console.error('[Equipment] 更新校准报告失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// DELETE /api/equipment/calibration/:id — 删除校准报告
router.delete('/calibration/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const groupId = req.user.group_id;

    const check = await query(
      'SELECT id FROM calibration_reports WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );
    if (check.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '校准报告不存在' });
    }

    await query(
      'DELETE FROM calibration_reports WHERE id = @p0 AND group_id = @p1',
      [id, groupId],
      [sql.Int, sql.Int]
    );

    res.json({ code: 200, message: '校准报告删除成功' });
  } catch (err) {
    console.error('[Equipment] 删除校准报告失败:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

module.exports = router;
