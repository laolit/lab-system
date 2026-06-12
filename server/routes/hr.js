const express = require('express');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 人力资源与能力资质 - 暂返回占位数据
router.get('/list', authMiddleware, (req, res) => {
  res.json({ code: 200, data: [], total: 0 });
});

module.exports = router;
