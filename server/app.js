const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const logger = require('./middleware/logger');

// 路由模块
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const qualityRoutes = require('./routes/quality');
const hrRoutes = require('./routes/hr');
const equipmentRoutes = require('./routes/equipment');
const consumablesRoutes = require('./routes/consumables');
const documentsRoutes = require('./routes/documents');
const environmentRoutes = require('./routes/environment');
const riskRoutes = require('./routes/risk');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- 中间件 ----------
app.use(cors());
app.use(morgan('dev'));
app.use(logger);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false }));

// ---------- 静态资源 ----------
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- API 路由 ----------
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/quality', qualityRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/consumables', consumablesRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/environment', environmentRoutes);
app.use('/api/risk', riskRoutes);
app.use('/api/admin', adminRoutes);

// ---------- 前端页面路由（SPA fallback） ----------
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// ---------- 全局错误处理 ----------
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  const status = err.status || err.statusCode || 500;
  const message = status === 413 ? '请求体过大，请减少上传文件大小' : (err.message || '服务器内部错误');
  res.status(status).json({ code: status, message });
});

// ---------- 启动 ----------
app.listen(PORT, () => {
  console.log(`[Server] ISO15189 实验室无纸化管理系统已启动: http://localhost:${PORT}`);
});

module.exports = app;
