/**
 * 数据库初始化脚本
 * 1. 创建 users 表（如不存在）
 * 2. 创建 groups 表（如不存在）
 * 3. 创建 user_groups 关联表（如不存在）
 * 4. users 表新增 default_group_id 字段（如不存在）
 * 5. 插入默认小组：临床检验、临床生化、临床免疫
 * 6. 插入默认 admin 账号并关联到所有小组
 * 使用: node db-init.js
 */
const bcrypt = require('bcryptjs');
const { getPool, query } = require('./utils/db');

async function init() {
  try {
    console.log('[DB-Init] 开始数据库初始化...');

    // ============ 1. users 表 ============
    await query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
      CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,           -- 主键ID，自增
        username NVARCHAR(50) NOT NULL UNIQUE,      -- 登录用户名
        password_hash NVARCHAR(255) NOT NULL,        -- bcrypt 密码哈希
        display_name NVARCHAR(100),                 -- 显示名称（姓名）
        role NVARCHAR(20),                          -- 角色: admin/manager/operator/viewer
        status NVARCHAR(10) DEFAULT 'active',       -- 状态: active=正常, disabled=禁用
        created_at DATETIME DEFAULT GETDATE()       -- 创建时间
      );
    `);
    console.log('[DB-Init] ✓ users 表已就绪');

    // ============ 2. groups 表 ============
    await query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='groups' AND xtype='U')
      CREATE TABLE groups (
        id INT IDENTITY(1,1) PRIMARY KEY,           -- 主键ID，自增
        name NVARCHAR(100) NOT NULL,                -- 小组名称（如：临床检验）
        code NVARCHAR(50) NOT NULL UNIQUE,          -- 小组编码（唯一标识，如 clinical_lab）
        description NVARCHAR(200),                  -- 小组描述/备注
        status NVARCHAR(10) DEFAULT 'active',       -- 状态: active=启用, inactive=停用
        created_at DATETIME DEFAULT GETDATE()       -- 创建时间
      );
    `);
    console.log('[DB-Init] ✓ groups 表已就绪');

    // ============ 3. user_groups 关联表 ============
    await query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_groups' AND xtype='U')
      CREATE TABLE user_groups (
        id INT IDENTITY(1,1) PRIMARY KEY,           -- 主键ID，自增
        user_id INT NOT NULL,                       -- 用户ID，关联 users 表
        group_id INT NOT NULL,                      -- 小组ID，关联 groups 表
        CONSTRAINT FK_user_groups_user              -- 外键约束：用户
            FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT FK_user_groups_group             -- 外键约束：小组
            FOREIGN KEY (group_id) REFERENCES groups(id),
        CONSTRAINT UQ_user_group                    -- 唯一约束：同一用户-小组关系不重复
            UNIQUE(user_id, group_id)
      );
    `);
    console.log('[DB-Init] ✓ user_groups 表已就绪');

    // ============ 4. users 表补增 default_group_id 字段 ============
    // 检查字段是否存在，不存在则添加
    const colCheck = await query(`
      SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'default_group_id'
    `);
    if (colCheck.recordset.length === 0) {
      await query(`
        ALTER TABLE users ADD
          default_group_id INT NULL                 -- 默认登录小组ID，可为空
          CONSTRAINT FK_users_default_group         -- 外键约束
              FOREIGN KEY (default_group_id) REFERENCES groups(id)
      `);
      console.log('[DB-Init] ✓ users 表已增加 default_group_id 字段');
    } else {
      console.log('[DB-Init] - default_group_id 字段已存在，跳过');
    }

    // ============ 5. 插入默认小组 ============
    const defaultGroups = [
      { name: '临床检验', code: 'clinical_lab', description: '临床检验小组' },
      { name: '临床生化', code: 'clinical_biochem', description: '临床生化小组' },
      { name: '临床免疫', code: 'clinical_immuno', description: '临床免疫小组' },
    ];

    for (const g of defaultGroups) {
      const exists = await query("SELECT id FROM groups WHERE code = @p0", [g.code]);
      if (exists.recordset.length === 0) {
        await query(
          "INSERT INTO groups (name, code, description) VALUES (@p0, @p1, @p2)",
          [g.name, g.code, g.description]
        );
        console.log(`[DB-Init] + 新增小组: ${g.name} (${g.code})`);
      }
    }

    // ============ 6. 插入默认 admin 账号 ============
    const userCheck = await query("SELECT id FROM users WHERE username = 'admin'");
    let adminId;
    if (userCheck.recordset.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      const insertResult = await query(
        "INSERT INTO users (username, password_hash, display_name, role) OUTPUT INSERTED.id VALUES (@p0, @p1, @p2, @p3)",
        ['admin', hash, '系统管理员', 'admin']
      );
      adminId = insertResult.recordset[0].id;
      console.log('[DB-Init] + 默认管理员已创建: admin / admin123');
    } else {
      adminId = userCheck.recordset[0].id;
      console.log('[DB-Init] - admin 账号已存在，跳过');
    }

    // ============ 7. 将 admin 关联到所有小组 ============
    const allGroups = await query("SELECT id, code FROM groups WHERE status = 'active'");
    for (const g of allGroups.recordset) {
      const linkExists = await query(
        "SELECT id FROM user_groups WHERE user_id = @p0 AND group_id = @p1",
        [adminId, g.id]
      );
      if (linkExists.recordset.length === 0) {
        await query(
          "INSERT INTO user_groups (user_id, group_id) VALUES (@p0, @p1)",
          [adminId, g.id]
        );
        console.log(`[DB-Init] + 关联 admin → ${g.code}`);
      }
    }

    // ============ 8. 设置 admin 默认小组 ============
    const firstGroup = await query("SELECT TOP 1 id FROM groups WHERE status = 'active' ORDER BY id");
    if (firstGroup.recordset.length > 0) {
      await query("UPDATE users SET default_group_id = @p0 WHERE id = @p1 AND default_group_id IS NULL",
        [firstGroup.recordset[0].id, adminId]);
    }

    // ============ 9. instruments 仪器表 ============
    await query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='instruments' AND xtype='U')
      BEGIN
        CREATE TABLE instruments (
            id              INT IDENTITY(1,1) PRIMARY KEY,
            name            NVARCHAR(200) NOT NULL,
            model           NVARCHAR(200) NOT NULL,
            serial_number   NVARCHAR(100),
            manufacturer    NVARCHAR(200) NOT NULL,
            purchase_date   DATE,
            add_date        DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
            status          NVARCHAR(20) DEFAULT 'in_use',
            location        NVARCHAR(200),
            contact_person  NVARCHAR(100),
            remarks         NVARCHAR(500),
            group_id        INT NOT NULL,
            created_at      DATETIME DEFAULT GETDATE(),
            updated_at      DATETIME DEFAULT GETDATE(),
            CONSTRAINT FK_instruments_group FOREIGN KEY (group_id) REFERENCES groups(id)
        );

        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='主键ID，自增',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='仪器名称',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='name';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='仪器型号',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='model';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='序列号/出厂编号',             @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='serial_number';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='仪器厂商/品牌',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='manufacturer';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='购置日期',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='purchase_date';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='仪器添加日期',                @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='add_date';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='仪器状态: in_use=使用中, idle=闲置, repairing=维修中, scrapped=已报废', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='status';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='存放位置',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='location';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='负责人',                     @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='contact_person';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='备注',                       @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='remarks';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='所属小组ID，外键关联groups表', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='group_id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='创建时间',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='created_at';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='最后更新时间',                @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='updated_at';
      END
    `);
    console.log('[DB-Init] ✓ instruments 表已就绪');

    // ---------- instruments 表字段补增/升级：日维护/周维护/月维护（长文本 NVARCHAR(MAX)） ----------
    const instDailyCheck = await query(`SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('instruments') AND name = 'daily_maintenance'`);
    if (instDailyCheck.recordset.length === 0) {
      await query(`ALTER TABLE instruments ADD daily_maintenance NVARCHAR(MAX)`);
      await query(`EXEC sys.sp_addextendedproperty @name='MS_Description', @value='日维护内容（长文本）', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='daily_maintenance'`);
      console.log('[DB-Init] ✓ instruments 表已增加 daily_maintenance 字段 (NVARCHAR(MAX))');
    } else {
      await query(`ALTER TABLE instruments ALTER COLUMN daily_maintenance NVARCHAR(MAX)`);
      console.log('[DB-Init] ✓ instruments 表 daily_maintenance 字段已升级为 NVARCHAR(MAX)');
    }
    const instWeeklyCheck = await query(`SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('instruments') AND name = 'weekly_maintenance'`);
    if (instWeeklyCheck.recordset.length === 0) {
      await query(`ALTER TABLE instruments ADD weekly_maintenance NVARCHAR(MAX)`);
      await query(`EXEC sys.sp_addextendedproperty @name='MS_Description', @value='周维护内容（长文本）', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='weekly_maintenance'`);
      console.log('[DB-Init] ✓ instruments 表已增加 weekly_maintenance 字段 (NVARCHAR(MAX))');
    } else {
      await query(`ALTER TABLE instruments ALTER COLUMN weekly_maintenance NVARCHAR(MAX)`);
      console.log('[DB-Init] ✓ instruments 表 weekly_maintenance 字段已升级为 NVARCHAR(MAX)');
    }
    const instMonthlyCheck = await query(`SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('instruments') AND name = 'monthly_maintenance'`);
    if (instMonthlyCheck.recordset.length === 0) {
      await query(`ALTER TABLE instruments ADD monthly_maintenance NVARCHAR(MAX)`);
      await query(`EXEC sys.sp_addextendedproperty @name='MS_Description', @value='月维护内容（长文本）', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='instruments', @level2type='COLUMN',@level2name='monthly_maintenance'`);
      console.log('[DB-Init] ✓ instruments 表已增加 monthly_maintenance 字段 (NVARCHAR(MAX))');
    } else {
      await query(`ALTER TABLE instruments ALTER COLUMN monthly_maintenance NVARCHAR(MAX)`);
      console.log('[DB-Init] ✓ instruments 表 monthly_maintenance 字段已升级为 NVARCHAR(MAX)');
    }

    // 插入样本仪器数据
    const instCount = await query("SELECT COUNT(*) AS cnt FROM instruments");
    if (instCount.recordset[0].cnt === 0) {
      const sampleInstruments = [
        { name: '全自动生化分析仪', model: 'AU5800', serial_number: 'SN-2023-AU-001', manufacturer: 'Beckman Coulter', purchase_date: '2023-03-15', add_date: '2023-03-20', status: 'in_use', location: '生化实验室 A区', contact_person: '张工', remarks: '每日开机自检正常', group_code: 'clinical_biochem' },
        { name: '全自动血细胞分析仪', model: 'XN-1000', serial_number: 'SN-2023-XN-002', manufacturer: 'Sysmex', purchase_date: '2023-06-01', add_date: '2023-06-05', status: 'in_use', location: '临检实验室 B区', contact_person: '李工', remarks: '', group_code: 'clinical_lab' },
        { name: '化学发光免疫分析仪', model: 'Cobas e 801', serial_number: 'SN-2024-CE-003', manufacturer: 'Roche', purchase_date: '2024-01-10', add_date: '2024-01-15', status: 'idle', location: '免疫实验室 C区', contact_person: '王工', remarks: '待校准后启用', group_code: 'clinical_immuno' },
      ];
      for (const inst of sampleInstruments) {
        const grp = await query("SELECT id FROM groups WHERE code = @p0", [inst.group_code]);
        if (grp.recordset.length > 0) {
          const gid = grp.recordset[0].id;
          await query(
            `INSERT INTO instruments (name, model, serial_number, manufacturer, purchase_date, add_date, status, location, contact_person, remarks, group_id)
             VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10)`,
            [inst.name, inst.model, inst.serial_number, inst.manufacturer, inst.purchase_date, inst.add_date, inst.status, inst.location, inst.contact_person, inst.remarks, gid]
          );
          console.log(`[DB-Init] + 新增仪器: ${inst.name} (${inst.model}) → ${inst.group_code}`);
        }
      }
    } else {
      console.log('[DB-Init] - instruments 表已有数据，跳过样本插入');
    }

    // ============ 10. maintenance_records 维护保养记录表 ============
    await query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='maintenance_records' AND xtype='U')
      BEGIN
        CREATE TABLE maintenance_records (
            id                  INT IDENTITY(1,1) PRIMARY KEY,
            instrument_id       INT NOT NULL,
            maintenance_date    DATE NOT NULL,
            maintenance_type    NVARCHAR(20) NOT NULL,
            performed_by        NVARCHAR(50) NOT NULL,
            group_id            INT NOT NULL,
            remarks             NVARCHAR(500),
            maintenance_content NVARCHAR(MAX),
            created_at          DATETIME DEFAULT GETDATE(),
            updated_at          DATETIME DEFAULT GETDATE(),
            CONSTRAINT FK_maintenance_instrument FOREIGN KEY (instrument_id) REFERENCES instruments(id),
            CONSTRAINT FK_maintenance_group FOREIGN KEY (group_id) REFERENCES groups(id)
        );

        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='主键ID，自增',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='maintenance_records', @level2type='COLUMN',@level2name='id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='关联仪器ID，外键关联instruments表', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='maintenance_records', @level2type='COLUMN',@level2name='instrument_id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='保养日期',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='maintenance_records', @level2type='COLUMN',@level2name='maintenance_date';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='保养类型: 日保养/周保养/月保养', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='maintenance_records', @level2type='COLUMN',@level2name='maintenance_type';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='执行保养的人员',              @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='maintenance_records', @level2type='COLUMN',@level2name='performed_by';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='所属小组ID，外键关联groups表', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='maintenance_records', @level2type='COLUMN',@level2name='group_id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='备注',                       @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='maintenance_records', @level2type='COLUMN',@level2name='remarks';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='维护内容（从仪器台账自动带入）', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='maintenance_records', @level2type='COLUMN',@level2name='maintenance_content';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='创建时间',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='maintenance_records', @level2type='COLUMN',@level2name='created_at';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='最后更新时间',                @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='maintenance_records', @level2type='COLUMN',@level2name='updated_at';
      END
    `);
    console.log('[DB-Init] ✓ maintenance_records 表已就绪');

    // ---------- maintenance_records 字段补增：维护内容 ----------
    const mtContentCheck = await query(`SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('maintenance_records') AND name = 'maintenance_content'`);
    if (mtContentCheck.recordset.length === 0) {
      await query(`ALTER TABLE maintenance_records ADD maintenance_content NVARCHAR(MAX)`);
      await query(`EXEC sys.sp_addextendedproperty @name='MS_Description', @value='维护内容（从仪器台账自动带入）', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='maintenance_records', @level2type='COLUMN',@level2name='maintenance_content'`);
      console.log('[DB-Init] ✓ maintenance_records 表已增加 maintenance_content 字段');
    }

    // 插入样本维护记录
    const mtCount = await query("SELECT COUNT(*) AS cnt FROM maintenance_records");
    if (mtCount.recordset[0].cnt === 0) {
      const sampleMaintenance = [
        { instrument_code: 'SN-2023-AU-001', maintenance_date: '2025-12-01', maintenance_type: '日保养', performed_by: '张工', remarks: '开机自检正常，清洁样品针' },
        { instrument_code: 'SN-2023-AU-001', maintenance_date: '2025-12-07', maintenance_type: '周保养', performed_by: '张工', remarks: '校准通过，更换反应杯' },
        { instrument_code: 'SN-2023-XN-002', maintenance_date: '2025-12-03', maintenance_type: '日保养', performed_by: '李工', remarks: '清洗管路，检查试剂余量' },
        { instrument_code: 'SN-2023-XN-002', maintenance_date: '2025-11-30', maintenance_type: '月保养', performed_by: '李工', remarks: '全面维护，更换泵管' },
        { instrument_code: 'SN-2024-CE-003', maintenance_date: '2025-11-15', maintenance_type: '周保养', performed_by: '王工', remarks: '清洁检测室，校准光路' },
      ];
      for (const mt of sampleMaintenance) {
        const inst = await query("SELECT id, group_id FROM instruments WHERE serial_number = @p0", [mt.instrument_code]);
        if (inst.recordset.length > 0) {
          const { id: instId, group_id: gid } = inst.recordset[0];
          await query(
            `INSERT INTO maintenance_records (instrument_id, maintenance_date, maintenance_type, performed_by, group_id, remarks)
             VALUES (@p0, @p1, @p2, @p3, @p4, @p5)`,
            [instId, mt.maintenance_date, mt.maintenance_type, mt.performed_by, gid, mt.remarks]
          );
          console.log(`[DB-Init] + 新增维护记录: ${mt.instrument_code} ${mt.maintenance_date} ${mt.maintenance_type}`);
        }
      }
    } else {
      console.log('[DB-Init] - maintenance_records 表已有数据，跳过样本插入');
    }

    // ============ 11. usage_records 使用登记记录表 ============
    await query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='usage_records' AND xtype='U')
      BEGIN
        CREATE TABLE usage_records (
            id                  INT IDENTITY(1,1) PRIMARY KEY,
            usage_date          DATE NOT NULL,
            start_time          DATETIME NOT NULL,
            end_time            DATETIME,
            sample_type         NVARCHAR(100),
            sample_count        INT,
            instrument_id       INT NOT NULL,
            usage_function      NVARCHAR(200) DEFAULT '常规',
            instrument_status   NVARCHAR(100) DEFAULT '常规',
            fault_handling      NVARCHAR(500),
            operator            NVARCHAR(50) NOT NULL,
            remarks             NVARCHAR(500),
            group_id            INT NOT NULL,
            created_at          DATETIME DEFAULT GETDATE(),
            updated_at          DATETIME DEFAULT GETDATE(),
            CONSTRAINT FK_usage_instrument FOREIGN KEY (instrument_id) REFERENCES instruments(id),
            CONSTRAINT FK_usage_group FOREIGN KEY (group_id) REFERENCES groups(id)
        );

        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='主键ID，自增',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='使用日期',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='usage_date';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='开始使用时间',                @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='start_time';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='终止使用时间',                @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='end_time';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='标本类型',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='sample_type';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='标本数量',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='sample_count';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='关联仪器ID，外键关联instruments表', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='instrument_id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='使用仪器何功能',              @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='usage_function';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='仪器状态',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='instrument_status';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='故障原因及处理',              @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='fault_handling';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='操作人',                     @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='operator';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='备注',                       @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='remarks';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='所属小组ID，外键关联groups表', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='group_id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='创建时间',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='created_at';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='最后更新时间',                @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='usage_records', @level2type='COLUMN',@level2name='updated_at';
      END
    `);
    console.log('[DB-Init] ✓ usage_records 表已就绪');

    // 插入样本使用登记记录
    const urCount = await query("SELECT COUNT(*) AS cnt FROM usage_records");
    if (urCount.recordset[0].cnt === 0) {
      const sampleUsage = [
        { instrument_code: 'SN-2023-AU-001', usage_date: '2025-12-10', start_time: '2025-12-10 08:30', end_time: '2025-12-10 12:00', sample_type: '血清', sample_count: 45, usage_function: '常规', instrument_status: '正常', fault_handling: '', operator: '张工', remarks: '每日例行检测' },
        { instrument_code: 'SN-2023-XN-002', usage_date: '2025-12-11', start_time: '2025-12-11 09:00', end_time: '2025-12-11 14:30', sample_type: '全血', sample_count: 60, usage_function: '常规', instrument_status: '正常', fault_handling: '', operator: '李工', remarks: '' },
        { instrument_code: 'SN-2024-CE-003', usage_date: '2025-12-12', start_time: '2025-12-12 10:00', end_time: '2025-12-12 11:30', sample_type: '血浆', sample_count: 20, usage_function: '特殊检测', instrument_status: '正常', fault_handling: '轻微报警，重启后恢复', operator: '王工', remarks: '校准后首次使用' },
      ];
      for (const ur of sampleUsage) {
        const inst = await query("SELECT id, group_id FROM instruments WHERE serial_number = @p0", [ur.instrument_code]);
        if (inst.recordset.length > 0) {
          const { id: instId, group_id: gid } = inst.recordset[0];
          await query(
            `INSERT INTO usage_records (usage_date, start_time, end_time, sample_type, sample_count, instrument_id, usage_function, instrument_status, fault_handling, operator, remarks, group_id)
             VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11)`,
            [ur.usage_date, ur.start_time, ur.end_time, ur.sample_type, ur.sample_count, instId, ur.usage_function, ur.instrument_status, ur.fault_handling, ur.operator, ur.remarks, gid]
          );
          console.log(`[DB-Init] + 新增使用登记: ${ur.instrument_code} ${ur.usage_date} ${ur.operator}`);
        }
      }
    } else {
      console.log('[DB-Init] - usage_records 表已有数据，跳过样本插入');
    }

    // ============ 12. repair_records 维修记录表 ============
    await query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='repair_records' AND xtype='U')
      BEGIN
        CREATE TABLE repair_records (
            id                              INT IDENTITY(1,1) PRIMARY KEY,
            instrument_id                   INT NOT NULL,
            fault_description               NVARCHAR(1000),
            replaced_after_fault            NVARCHAR(2),
            discoverer                      NVARCHAR(50),
            discovery_time                  DATETIME,
            fault_cause_process             NVARCHAR(1000),
            handler                         NVARCHAR(50),
            handling_time                   DATETIME,
            need_performance_verification   NVARCHAR(2),
            verification_method             NVARCHAR(200),
            verification_person             NVARCHAR(50),
            verification_date               DATE,
            need_trace_specimens            NVARCHAR(2),
            traced_situation                NVARCHAR(500),
            untraced_reason                 NVARCHAR(500),
            trace_handler                   NVARCHAR(50),
            trace_date                      DATE,
            group_id                        INT NOT NULL,
            created_at                      DATETIME DEFAULT GETDATE(),
            updated_at                      DATETIME DEFAULT GETDATE(),
            CONSTRAINT FK_repair_instrument FOREIGN KEY (instrument_id) REFERENCES instruments(id),
            CONSTRAINT FK_repair_group FOREIGN KEY (group_id) REFERENCES groups(id)
        );

        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='主键ID，自增',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='关联仪器ID',                 @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='instrument_id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='故障现象描述',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='fault_description';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='是否故障后更换停用: 是/否',  @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='replaced_after_fault';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='发现人',                     @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='discoverer';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='发现时间',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='discovery_time';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='故障原因及处理过程',          @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='fault_cause_process';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='处理人',                     @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='handler';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='处理时间',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='handling_time';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='是否需性能验证: 是/否',      @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='need_performance_verification';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='验证方式',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='verification_method';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='性能验证人',                 @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='verification_person';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='性能验证日期',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='verification_date';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='是否追溯故障前标本: 是/否',  @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='need_trace_specimens';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='已追溯的情况',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='traced_situation';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='未追溯的理由',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='untraced_reason';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='追溯处理人',                 @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='trace_handler';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='追溯日期',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='trace_date';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='所属小组ID',                 @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='group_id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='创建时间',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='created_at';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='最后更新时间',                @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='repair_records', @level2type='COLUMN',@level2name='updated_at';
      END
    `);
    console.log('[DB-Init] ✓ repair_records 表已就绪');

    // 插入样本维修记录
    const rpCount = await query("SELECT COUNT(*) AS cnt FROM repair_records");
    if (rpCount.recordset[0].cnt === 0) {
      const sampleRepair = [
        { instrument_code: 'SN-2023-AU-001', fault_description: '仪器报警E501，样品针无法复位', replaced_after_fault: '否', discoverer: '张工', discovery_time: '2025-11-20 09:30', fault_cause_process: '检查发现样品针传感器积尘，清洁传感器并重新校准针位置后恢复正常', handler: '张工', handling_time: '2025-11-20 11:00', need_performance_verification: '是', verification_method: '校准品重复性测试', verification_person: '李工', verification_date: '2025-11-21', need_trace_specimens: '是', traced_situation: '追溯故障前24小时内45份血清标本，结果均无异常', untraced_reason: '', trace_handler: '李工', trace_date: '2025-11-22' },
        { instrument_code: 'SN-2024-CE-003', fault_description: '发光值偏低，质控失控', replaced_after_fault: '是', discoverer: '王工', discovery_time: '2025-12-01 14:00', fault_cause_process: '更换发光底物液及清洗管路，重新校准后质控通过', handler: '王工', handling_time: '2025-12-01 17:30', need_performance_verification: '是', verification_method: '质控品双份测试', verification_person: '张工', verification_date: '2025-12-02', need_trace_specimens: '否', traced_situation: '', untraced_reason: '仪器仅用于科研项目，未涉及临床标本', trace_handler: '王工', trace_date: '2025-12-02' },
      ];
      for (const rp of sampleRepair) {
        const inst = await query("SELECT id, group_id FROM instruments WHERE serial_number = @p0", [rp.instrument_code]);
        if (inst.recordset.length > 0) {
          const { id: instId, group_id: gid } = inst.recordset[0];
          await query(
            `INSERT INTO repair_records (instrument_id, fault_description, replaced_after_fault, discoverer, discovery_time, fault_cause_process, handler, handling_time, need_performance_verification, verification_method, verification_person, verification_date, need_trace_specimens, traced_situation, untraced_reason, trace_handler, trace_date, group_id)
             VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13, @p14, @p15, @p16, @p17)`,
            [instId, rp.fault_description, rp.replaced_after_fault, rp.discoverer, rp.discovery_time, rp.fault_cause_process, rp.handler, rp.handling_time, rp.need_performance_verification, rp.verification_method, rp.verification_person, rp.verification_date, rp.need_trace_specimens, rp.traced_situation, rp.untraced_reason, rp.trace_handler, rp.trace_date, gid]
          );
          console.log(`[DB-Init] + 新增维修记录: ${rp.instrument_code} ${rp.fault_description.slice(0,20)}...`);
        }
      }
    } else {
      console.log('[DB-Init] - repair_records 表已有数据，跳过样本插入');
    }

    // ============ 13. calibration_reports — 仪器校准报告 ============
    console.log('[DB-Init] 正在初始化 calibration_reports 表...');
    await query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='calibration_reports' AND xtype='U')
      BEGIN
        CREATE TABLE calibration_reports (
            id              INT IDENTITY(1,1) PRIMARY KEY,
            instrument_id   INT NOT NULL,
            files           NVARCHAR(MAX),
            uploader        NVARCHAR(50) NOT NULL,
            report_date     DATE NOT NULL,
            group_id        INT NOT NULL,
            created_at      DATETIME DEFAULT GETDATE(),
            updated_at      DATETIME DEFAULT GETDATE(),
            CONSTRAINT FK_calrep_instrument FOREIGN KEY (instrument_id) REFERENCES instruments(id),
            CONSTRAINT FK_calrep_group FOREIGN KEY (group_id) REFERENCES groups(id)
        );

        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='主键ID，自增',              @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='calibration_reports', @level2type='COLUMN',@level2name='id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='关联仪器ID',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='calibration_reports', @level2type='COLUMN',@level2name='instrument_id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='上传文件JSON（含name/type/size/data）', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='calibration_reports', @level2type='COLUMN',@level2name='files';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='上传人',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='calibration_reports', @level2type='COLUMN',@level2name='uploader';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='报告日期',                 @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='calibration_reports', @level2type='COLUMN',@level2name='report_date';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='所属小组ID',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='calibration_reports', @level2type='COLUMN',@level2name='group_id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='创建时间',                 @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='calibration_reports', @level2type='COLUMN',@level2name='created_at';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='最后更新时间',              @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='calibration_reports', @level2type='COLUMN',@level2name='updated_at';
      END
    `);
    console.log('[DB-Init] ✓ calibration_reports 表已就绪');

    // 插入样本校准报告
    const crCount = await query("SELECT COUNT(*) AS cnt FROM calibration_reports");
    if (crCount.recordset[0].cnt === 0) {
      // 用一个很小的 1×1 透明 PNG 作为样本文件 base64
      const sampleBase64PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const sampleFiles = JSON.stringify([
        { name: '校准报告_2025Q1.pdf', type: 'application/pdf', size: 245760, data: 'JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwgL1R5cGUgL0NhdGFsb2cgL1BhZ2VzIDIgMCBSID4+CmVuZG9iagoyIDAgb2JqCjw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbMyAwIFJdIC9Db3VudCAxID4+CmVuZG9iagozIDAgb2JqCjw8IC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL01lZGlhQm94IFswIDAgMzAwIDE1MF0gL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNCAwIFIgPj4gPj4gL0NvbnRlbnRzIDUgMCBSID4+CmVuZG9iago0IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKNSAwIG9iago8PCAvTGVuZ3RoIDQ0ID4+CnN0cmVhbQpCVAovRjEgMTIgVGYKMCAxMCBUZAooU2FtcGxlIENhbGlicmF0aW9uIFJlcG9ydC4pIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQ1IDAwMDAwIG4gCjAwMDAwMDAzMjQgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MjEKJSVFT0Y=' }
      ]);
      const sampleCalibration = [
        { instrument_code: 'SN-2023-AU-001', uploader: '张工', report_date: '2025-06-15' },
        { instrument_code: 'SN-2024-CE-003', uploader: '王工', report_date: '2025-09-20' },
      ];
      for (const cr of sampleCalibration) {
        const inst = await query("SELECT id, group_id FROM instruments WHERE serial_number = @p0", [cr.instrument_code]);
        if (inst.recordset.length > 0) {
          const { id: instId, group_id: gid } = inst.recordset[0];
          await query(
            `INSERT INTO calibration_reports (instrument_id, files, uploader, report_date, group_id)
             VALUES (@p0, @p1, @p2, @p3, @p4)`,
            [instId, sampleFiles, cr.uploader, cr.report_date, gid]
          );
          console.log(`[DB-Init] + 新增校准报告: ${cr.instrument_code} ${cr.report_date}`);
        }
      }
    } else {
      console.log('[DB-Init] - calibration_reports 表已有数据，跳过样本插入');
    }

    // ============ 14. personnel 人员信息表 ============
    const personnelExists = await query("SELECT COUNT(*) AS cnt FROM sysobjects WHERE name='personnel' AND xtype='U'");
    if (personnelExists.recordset[0].cnt === 0) {
      await query(`
        BEGIN
          CREATE TABLE personnel (
            id INT IDENTITY(1,1) PRIMARY KEY,
            name NVARCHAR(50) NOT NULL,
            age INT,
            gender NVARCHAR(10),
            phone NVARCHAR(20),
            id_card NVARCHAR(18),
            hire_date DATE,
            title NVARCHAR(50),
            group_id INT NOT NULL,
            photo NVARCHAR(MAX),
            created_at DATETIME DEFAULT GETDATE(),
            updated_at DATETIME DEFAULT GETDATE(),
            CONSTRAINT FK_personnel_group FOREIGN KEY (group_id) REFERENCES groups(id)
          );

          EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'主键ID/自增', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'personnel', @level2type=N'COLUMN',@level2name=N'id';
          EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'姓名', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'personnel', @level2type=N'COLUMN',@level2name=N'name';
          EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'年龄', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'personnel', @level2type=N'COLUMN',@level2name=N'age';
          EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'性别', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'personnel', @level2type=N'COLUMN',@level2name=N'gender';
          EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'手机号', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'personnel', @level2type=N'COLUMN',@level2name=N'phone';
          EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'身份证号', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'personnel', @level2type=N'COLUMN',@level2name=N'id_card';
          EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'入职日期', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'personnel', @level2type=N'COLUMN',@level2name=N'hire_date';
          EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'职称', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'personnel', @level2type=N'COLUMN',@level2name=N'title';
          EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'所属小组ID', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'personnel', @level2type=N'COLUMN',@level2name=N'group_id';
          EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'证件照(base64)', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'personnel', @level2type=N'COLUMN',@level2name=N'photo';
          EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'创建时间', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'personnel', @level2type=N'COLUMN',@level2name=N'created_at';
          EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'最后更新时间', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'personnel', @level2type=N'COLUMN',@level2name=N'updated_at';
        END
      `);
      console.log('[DB-Init] ✓ personnel 表已就绪');
    } else {
      console.log('[DB-Init] - personnel 表已存在，跳过创建');
    }

    // --- 样本数据: personnel ---
    const personnelCount = await query("SELECT COUNT(*) AS cnt FROM personnel");
    if (personnelCount.recordset[0].cnt === 0) {
      const groups = await query("SELECT id, name FROM groups");
      const samplePersonnel = [
        { name: '张明', age: 35, gender: '男', phone: '13800138001', id_card: '310101198001010001', hire_date: '2018-03-15', title: '主管技师' },
        { name: '李红', age: 28, gender: '女', phone: '13800138002', id_card: '310101199201010002', hire_date: '2020-07-01', title: '检验技师' },
        { name: '王磊', age: 42, gender: '男', phone: '13800138003', id_card: '310101197801010003', hire_date: '2015-01-10', title: '副主任技师' },
      ];
      for (let i = 0; i < groups.recordset.length && i < samplePersonnel.length; i++) {
        const g = groups.recordset[i];
        const sp = samplePersonnel[i];
        await query(
          `INSERT INTO personnel (name, age, gender, phone, id_card, hire_date, title, group_id)
           VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7)`,
          [sp.name, sp.age, sp.gender, sp.phone, sp.id_card, sp.hire_date, sp.title, g.id]
        );
        console.log(`[DB-Init] + 新增人员: ${sp.name} → ${g.name}`);
      }
    } else {
      console.log('[DB-Init] - personnel 表已有数据，跳过样本插入');
    }

    // ============ 15. th_records 温湿度记录表 ============
    await query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='th_records' AND xtype='U')
      BEGIN
        CREATE TABLE th_records (
            id              INT IDENTITY(1,1) PRIMARY KEY,
            record_date     DATE NOT NULL,
            period          NVARCHAR(2) NOT NULL,
            temperature     DECIMAL(5,1),
            humidity        DECIMAL(4,1),
            recorder        NVARCHAR(50),
            remarks         NVARCHAR(500),
            group_id        INT NOT NULL,
            created_at      DATETIME DEFAULT GETDATE(),
            updated_at      DATETIME DEFAULT GETDATE(),
            CONSTRAINT FK_threcords_group FOREIGN KEY (group_id) REFERENCES groups(id)
        );

        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='主键ID，自增',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='th_records', @level2type='COLUMN',@level2name='id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='记录日期（精确到日期）',      @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='th_records', @level2type='COLUMN',@level2name='record_date';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='时段: 上午/下午',            @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='th_records', @level2type='COLUMN',@level2name='period';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='温度(°C)',                  @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='th_records', @level2type='COLUMN',@level2name='temperature';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='湿度(%RH)',                 @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='th_records', @level2type='COLUMN',@level2name='humidity';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='记录人',                     @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='th_records', @level2type='COLUMN',@level2name='recorder';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='备注',                       @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='th_records', @level2type='COLUMN',@level2name='remarks';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='所属小组ID，外键关联groups表', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='th_records', @level2type='COLUMN',@level2name='group_id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='创建时间',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='th_records', @level2type='COLUMN',@level2name='created_at';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='最后更新时间',                @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='th_records', @level2type='COLUMN',@level2name='updated_at';
      END
    `);
    console.log('[DB-Init] ✓ th_records 表已就绪');

    // ---------- th_records 字段补增：location ----------
    const thLocCheck = await query(`SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('th_records') AND name = 'location'`);
    if (thLocCheck.recordset.length === 0) {
      await query(`ALTER TABLE th_records ADD location NVARCHAR(200)`);
      await query(`EXEC sys.sp_addextendedproperty @name='MS_Description', @value='监测位置（如: 生化实验室A区）', @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='th_records', @level2type='COLUMN',@level2name='location'`);
      console.log('[DB-Init] ✓ th_records 表已增加 location 字段');
    } else {
      console.log('[DB-Init] - th_records.location 字段已存在，跳过');
    }

    // --- 样本数据: th_records ---
    const thCount = await query("SELECT COUNT(*) AS cnt FROM th_records");
    if (thCount.recordset[0].cnt === 0) {
      const groups = await query("SELECT id FROM groups");
      const sampleTH = [
        { record_date: '2026-06-15', period: '上午', temperature: 22.5, humidity: 45.0, recorder: '张明', remarks: '空调运行正常' },
        { record_date: '2026-06-15', period: '下午', temperature: 23.0, humidity: 48.0, recorder: '李红', remarks: '' },
        { record_date: '2026-06-14', period: '上午', temperature: 21.8, humidity: 42.0, recorder: '张明', remarks: '通风良好' },
        { record_date: '2026-06-14', period: '下午', temperature: 22.2, humidity: 44.5, recorder: '李红', remarks: '' },
      ];
      for (const grp of groups.recordset) {
        for (const rec of sampleTH) {
          await query(
            `INSERT INTO th_records (record_date, period, temperature, humidity, recorder, remarks, group_id)
             VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6)`,
            [rec.record_date, rec.period, rec.temperature, rec.humidity, rec.recorder, rec.remarks, grp.id]
          );
        }
      }
      console.log('[DB-Init] + 新增温湿度样本记录');
    } else {
      console.log('[DB-Init] - th_records 表已有数据，跳过样本插入');
    }

    // ============ 14. tat_db_sources — TAT 数据源配置 ============
    console.log('[DB-Init] 正在初始化 tat_db_sources 表...');
    await query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tat_db_sources' AND xtype='U')
      BEGIN
        CREATE TABLE tat_db_sources (
            id              INT IDENTITY(1,1) PRIMARY KEY,
            name            NVARCHAR(100) NOT NULL,
            server          NVARCHAR(200) NOT NULL,
            port            INT NOT NULL DEFAULT 1433,
            database_name   NVARCHAR(100) NOT NULL,
            username        NVARCHAR(100) NOT NULL,
            password_enc    NVARCHAR(500) NOT NULL,
            is_active       TINYINT DEFAULT 1,
            group_id        INT NOT NULL,
            created_at      DATETIME DEFAULT GETDATE(),
            updated_at      DATETIME DEFAULT GETDATE(),
            CONSTRAINT FK_tat_db_sources_group FOREIGN KEY (group_id) REFERENCES groups(id)
        );

        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='主键ID，自增',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_db_sources', @level2type='COLUMN',@level2name='id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='连接名称',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_db_sources', @level2type='COLUMN',@level2name='name';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='服务器地址',                 @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_db_sources', @level2type='COLUMN',@level2name='server';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='端口号，默认1433',           @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_db_sources', @level2type='COLUMN',@level2name='port';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='数据库名称',                 @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_db_sources', @level2type='COLUMN',@level2name='database_name';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='登录用户名',                 @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_db_sources', @level2type='COLUMN',@level2name='username';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='AES-256-CBC加密密码',        @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_db_sources', @level2type='COLUMN',@level2name='password_enc';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='状态: 1=启用, 0=停用',       @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_db_sources', @level2type='COLUMN',@level2name='is_active';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='所属小组ID',                 @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_db_sources', @level2type='COLUMN',@level2name='group_id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='创建时间',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_db_sources', @level2type='COLUMN',@level2name='created_at';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='最后更新时间',                @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_db_sources', @level2type='COLUMN',@level2name='updated_at';
      END
    `);
    console.log('[DB-Init] ✓ tat_db_sources 表已就绪');

    // ============ 15. tat_query_configs — TAT SQL查询配置 ============
    console.log('[DB-Init] 正在初始化 tat_query_configs 表...');
    await query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tat_query_configs' AND xtype='U')
      BEGIN
        CREATE TABLE tat_query_configs (
            id              INT IDENTITY(1,1) PRIMARY KEY,
            source_id       INT NOT NULL,
            name            NVARCHAR(100) NOT NULL,
            sql_query       NVARCHAR(MAX) NOT NULL,
            query_category  NVARCHAR(50),
            is_active       TINYINT DEFAULT 1,
            group_id        INT NOT NULL,
            created_at      DATETIME DEFAULT GETDATE(),
            updated_at      DATETIME DEFAULT GETDATE(),
            CONSTRAINT FK_tat_query_src FOREIGN KEY (source_id) REFERENCES tat_db_sources(id),
            CONSTRAINT FK_tat_query_group FOREIGN KEY (group_id) REFERENCES groups(id)
        );

        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='主键ID，自增',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_query_configs', @level2type='COLUMN',@level2name='id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='关联数据源ID',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_query_configs', @level2type='COLUMN',@level2name='source_id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='查询名称',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_query_configs', @level2type='COLUMN',@level2name='name';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='SQL查询语句',                @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_query_configs', @level2type='COLUMN',@level2name='sql_query';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='查询分类标签',               @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_query_configs', @level2type='COLUMN',@level2name='query_category';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='状态: 1=启用, 0=停用',       @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_query_configs', @level2type='COLUMN',@level2name='is_active';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='所属小组ID',                 @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_query_configs', @level2type='COLUMN',@level2name='group_id';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='创建时间',                   @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_query_configs', @level2type='COLUMN',@level2name='created_at';
        EXEC sys.sp_addextendedproperty @name='MS_Description', @value='最后更新时间',                @level0type='SCHEMA',@level0name='dbo', @level1type='TABLE',@level1name='tat_query_configs', @level2type='COLUMN',@level2name='updated_at';
      END
    `);
    console.log('[DB-Init] ✓ tat_query_configs 表已就绪');

    // --- 升级 tat_query_configs: target_module ---
    const tcCols = await query(`SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('tat_query_configs')`);
    const tcColNames = tcCols.recordset.map(c => c.name);
    if (!tcColNames.includes('target_module')) {
      await query(`ALTER TABLE tat_query_configs ADD target_module NVARCHAR(50)`);
      console.log('[DB-Init] ✓ tat_query_configs 表已增加 target_module 字段');
    } else {
      console.log('[DB-Init] - tat_query_configs.target_module 字段已存在，跳过');
    }

    // ============ 完成 ============
    const pool = await getPool();
    await pool.close();
    console.log('[DB-Init] 数据库初始化完成！');
    process.exit(0);
  } catch (err) {
    console.error('[DB-Init] 初始化失败:', err.message);
    process.exit(1);
  }
}

init();
