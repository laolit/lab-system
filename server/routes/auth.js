const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../utils/db');
const { generateToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ============================================
// GET /api/auth/groups — 获取可用小组列表（公开，供登录页下拉）
// ============================================
router.get('/groups', async (req, res) => {
  try {
    const result = await query(
      "SELECT id, name, code, description FROM groups WHERE status = 'active' ORDER BY id"
    );
    res.json({ code: 200, data: result.recordset });
  } catch (err) {
    console.error('[Auth] 获取小组列表错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ============================================
// POST /api/auth/login — 登录（用户名 + 密码 + 小组ID）
// ============================================
router.post('/login', async (req, res) => {
  try {
    const { username, password, group_id } = req.body;
    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
    }
    if (!group_id) {
      return res.status(400).json({ code: 400, message: '请选择所属小组' });
    }

    // 1. 验证用户名密码
    const result = await query(
      "SELECT id, username, password_hash, display_name, role, status, default_group_id FROM users WHERE username = @p0",
      [username]
    );

    if (result.recordset.length === 0) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' });
    }

    const user = result.recordset[0];

    if (user.status !== 'active') {
      return res.status(403).json({ code: 403, message: '账号已被禁用，请联系管理员' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' });
    }

    // 2. 检查用户是否属于所选小组
    const membership = await query(
      "SELECT g.id, g.name, g.code FROM user_groups ug JOIN groups g ON ug.group_id = g.id WHERE ug.user_id = @p0 AND ug.group_id = @p1 AND g.status = 'active'",
      [user.id, group_id]
    );

    if (membership.recordset.length === 0) {
      return res.status(403).json({ code: 403, message: '您不属于该小组，无权登录' });
    }

    const group = membership.recordset[0];

    // 3. 签发包含小组信息的 JWT
    const token = generateToken(user, group);

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          role: user.role,
        },
        group: {
          id: group.id,
          name: group.name,
          code: group.code,
        },
      },
    });
  } catch (err) {
    console.error('[Auth] 登录错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ============================================
// GET /api/auth/me — 获取当前用户信息
// ============================================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      "SELECT id, username, display_name, role, status, created_at FROM users WHERE id = @p0",
      [req.user.id]
    );
    if (result.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }
    const user = result.recordset[0];
    res.json({
      code: 200,
      data: {
        ...user,
        group_id: req.user.group_id,
        group_name: req.user.group_name,
        group_code: req.user.group_code,
      },
    });
  } catch (err) {
    console.error('[Auth] 获取用户信息错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ============================================
// GET /api/auth/my-groups — 获取当前用户所属的所有小组（供切换小组用）
// ============================================
router.get('/my-groups', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      "SELECT g.id, g.name, g.code FROM user_groups ug JOIN groups g ON ug.group_id = g.id WHERE ug.user_id = @p0 AND g.status = 'active' ORDER BY g.id",
      [req.user.id]
    );
    res.json({ code: 200, data: result.recordset });
  } catch (err) {
    console.error('[Auth] 获取用户小组错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ============================================
// POST /api/auth/switch-group — 切换当前小组
// ============================================
router.post('/switch-group', authMiddleware, async (req, res) => {
  try {
    const { group_id } = req.body;
    if (!group_id) {
      return res.status(400).json({ code: 400, message: '请选择小组' });
    }

    // 重新查询用户信息
    const userResult = await query(
      "SELECT id, username, password_hash, display_name, role, status FROM users WHERE id = @p0",
      [req.user.id]
    );
    if (userResult.recordset.length === 0) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }
    const user = userResult.recordset[0];

    // 验证用户属于所选小组
    const membership = await query(
      "SELECT g.id, g.name, g.code FROM user_groups ug JOIN groups g ON ug.group_id = g.id WHERE ug.user_id = @p0 AND ug.group_id = @p1 AND g.status = 'active'",
      [req.user.id, group_id]
    );
    if (membership.recordset.length === 0) {
      return res.status(403).json({ code: 403, message: '您不属于该小组，无权切换' });
    }

    const group = membership.recordset[0];
    const token = generateToken(user, group);

    res.json({
      code: 200,
      message: '小组切换成功',
      data: {
        token,
        group: { id: group.id, name: group.name, code: group.code },
      },
    });
  } catch (err) {
    console.error('[Auth] 切换小组错误:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
});

// ============================================
// POST /api/auth/logout
// ============================================
router.post('/logout', authMiddleware, (req, res) => {
  res.json({ code: 200, message: '已登出' });
});

module.exports = router;
