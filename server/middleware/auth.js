const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'iso15189-lab-secret-key-2024';
const JWT_EXPIRES_IN = '8h';

/**
 * 签发 JWT Token
 * @param {Object} user - 用户信息
 * @param {Object} group - 当前所选小组 { id, name, code }
 */
function generateToken(user, group) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      group_id: group.id,
      group_name: group.name,
      group_code: group.code,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未登录或 Token 已过期' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, username, role, group_id, group_name, group_code }
    next();
  } catch (err) {
    return res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ code: 403, message: '权限不足' });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole, generateToken, JWT_SECRET };
