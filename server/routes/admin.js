const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../utils/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// ============================================
// 用户管理
// ============================================

// GET /api/admin/users — 用户列表（含所属小组）
router.get('/users', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const users = await query(
      "SELECT id, username, display_name, role, status, created_at FROM users ORDER BY id"
    );

    // 查每个用户所属的小组
    const userGroups = await query(
      "SELECT ug.user_id, g.id AS group_id, g.name AS group_name FROM user_groups ug JOIN groups g ON ug.group_id = g.id ORDER BY ug.user_id, g.id"
    );

    // 组装
    const groupMap = {};
    for (const row of userGroups.recordset) {
      if (!groupMap[row.user_id]) groupMap[row.user_id] = [];
      groupMap[row.user_id].push({ id: row.group_id, name: row.group_name });
    }

    const data = users.recordset.map(u => ({
      ...u,
      groups: groupMap[u.id] || [],
    }));

    res.json({ code: 200, data, total: data.length });
  } catch (err) {
    console.error('[Admin] 查询用户列表错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// POST /api/admin/users — 新增用户（含小组分配）
router.post('/users', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { username, password, display_name, role, group_ids } = req.body;
    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
    }

    // 检查用户名是否已存在
    const existing = await query("SELECT id FROM users WHERE username = @p0", [username]);
    if (existing.recordset.length > 0) {
      return res.status(400).json({ code: 400, message: '用户名已存在' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const insertResult = await query(
      "INSERT INTO users (username, password_hash, display_name, role) OUTPUT INSERTED.id VALUES (@p0, @p1, @p2, @p3)",
      [username, password_hash, display_name || username, role || 'viewer']
    );
    const userId = insertResult.recordset[0].id;

    // 关联小组
    if (group_ids && group_ids.length > 0) {
      for (const gid of group_ids) {
        await query("INSERT INTO user_groups (user_id, group_id) VALUES (@p0, @p1)", [userId, gid]);
      }
    }

    res.json({ code: 200, message: '用户创建成功' });
  } catch (err) {
    console.error('[Admin] 创建用户错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// PUT /api/admin/users/:id — 编辑用户（含更新小组关联）
router.put('/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { display_name, role, status, group_ids } = req.body;

    await query(
      "UPDATE users SET display_name = @p0, role = @p1, status = @p2 WHERE id = @p3",
      [display_name, role, status, id]
    );

    // 更新小组关联：先删后插
    if (group_ids !== undefined) {
      await query("DELETE FROM user_groups WHERE user_id = @p0", [id]);
      for (const gid of group_ids) {
        await query("INSERT INTO user_groups (user_id, group_id) VALUES (@p0, @p1)", [id, gid]);
      }
    }

    res.json({ code: 200, message: '用户更新成功' });
  } catch (err) {
    console.error('[Admin] 更新用户错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// DELETE /api/admin/users/:id — 删除用户
router.delete('/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    await query("DELETE FROM user_groups WHERE user_id = @p0", [id]);
    await query("DELETE FROM users WHERE id = @p0", [id]);
    res.json({ code: 200, message: '用户删除成功' });
  } catch (err) {
    console.error('[Admin] 删除用户错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// PUT /api/admin/users/:id/password — 重置密码
router.put('/users/:id/password', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ code: 400, message: '密码不能为空' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    await query("UPDATE users SET password_hash = @p0 WHERE id = @p1", [password_hash, id]);

    res.json({ code: 200, message: '密码重置成功' });
  } catch (err) {
    console.error('[Admin] 重置密码错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ============================================
// 小组管理
// ============================================

// GET /api/admin/groups — 小组列表
router.get('/groups', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(
      "SELECT id, name, code, description, status, created_at FROM groups ORDER BY id"
    );
    res.json({ code: 200, data: result.recordset, total: result.recordset.length });
  } catch (err) {
    console.error('[Admin] 查询小组列表错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// POST /api/admin/groups — 新增小组
router.post('/groups', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { name, code, description } = req.body;
    if (!name || !code) {
      return res.status(400).json({ code: 400, message: '名称和编码不能为空' });
    }

    const existing = await query("SELECT id FROM groups WHERE code = @p0", [code]);
    if (existing.recordset.length > 0) {
      return res.status(400).json({ code: 400, message: '小组编码已存在' });
    }

    await query(
      "INSERT INTO groups (name, code, description) VALUES (@p0, @p1, @p2)",
      [name, code, description || '']
    );
    res.json({ code: 200, message: '小组创建成功' });
  } catch (err) {
    console.error('[Admin] 创建小组错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// PUT /api/admin/groups/:id — 编辑小组
router.put('/groups/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;

    await query(
      "UPDATE groups SET name = @p0, description = @p1, status = @p2 WHERE id = @p3",
      [name, description, status, id]
    );
    res.json({ code: 200, message: '小组更新成功' });
  } catch (err) {
    console.error('[Admin] 更新小组错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// DELETE /api/admin/groups/:id — 删除小组
router.delete('/groups/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    await query("DELETE FROM user_groups WHERE group_id = @p0", [id]);
    await query("DELETE FROM groups WHERE id = @p0", [id]);
    res.json({ code: 200, message: '小组删除成功' });
  } catch (err) {
    console.error('[Admin] 删除小组错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

module.exports = router;
