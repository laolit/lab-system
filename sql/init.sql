-- ISO15189 实验室无纸化管理系统 - 数据库初始化脚本
-- 第一期：仅创建用户管理相关表

-- 用户与权限表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(50) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    display_name NVARCHAR(100),
    role NVARCHAR(20) CHECK (role IN ('admin','manager','operator','viewer')),
    status NVARCHAR(10) DEFAULT 'active',
    created_at DATETIME DEFAULT GETDATE()
);

-- 插入默认管理员账号（密码: admin123，bcrypt 哈希，首次登录后请修改）
-- 此哈希值需在 Node.js 中动态生成插入，此处仅作标记
-- 实际插入通过 server 启动脚本执行
