const express = require('express');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 质量溯源与风险辅助 - 暂返回占位数据
router.get('/list', authMiddleware, (req, res) => {
  res.json({ code: 200, data: [], total: 0 });
});

module.exports = router;
