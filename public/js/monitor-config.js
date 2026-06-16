/* ========================================
   质量监控配置管理 CRUD
   ======================================== */

// ============================================
// SQL 编写指南 — 目标子模块 → 列格式说明 + 示例
// ============================================
const SQL_GUIDES = {
  kpi_summary: {
    title: 'KPI 概览卡片',
    displayType: '推荐 display_type: number',
    columns: [
      ['avg_pre_tat',   '平均实验前 TAT（分钟）', 'DECIMAL'],
      ['avg_intra_tat', '平均实验内 TAT（分钟）', 'DECIMAL'],
      ['pass_rate',     '总达标率（%）',           'DECIMAL(5,1)'],
      ['total_samples', '总样本数',                'INT'],
    ],
    example: `SELECT
  AVG(pre_tat_min) AS avg_pre_tat,
  AVG(intra_tat_min) AS avg_intra_tat,
  CAST(SUM(CASE WHEN is_pass = 1 THEN 1 ELSE 0 END) * 100.0
       / COUNT(*) AS DECIMAL(5,1)) AS pass_rate,
  COUNT(*) AS total_samples
FROM tat_records
WHERE record_date >= DATEADD(DAY, -30, GETDATE())`,
    renderNote: 'SQL 返回 1 行数据。每个数值列自动生成一个 KPI 卡片：列名下划线 → 空格并首字母大写作为卡片标签，值作为卡片数值。若只返回 1 列 1 值，则以查询名称作为卡片标签。',
  },
  trend_chart: {
    title: '30天趋势图',
    displayType: '推荐 display_type: line_chart',
    columns: [
      ['date',          '日期（X 轴标签）',  'DATE / VARCHAR'],
      ['avg_pre_tat',   '实验前 TAT（折线1）', 'DECIMAL'],
      ['avg_intra_tat', '实验内 TAT（折线2）', 'DECIMAL'],
    ],
    example: `SELECT
  CAST(record_date AS DATE) AS date,
  AVG(pre_tat_min) AS avg_pre_tat,
  AVG(intra_tat_min) AS avg_intra_tat
FROM tat_records
WHERE record_date >= DATEADD(DAY, -30, GETDATE())
GROUP BY CAST(record_date AS DATE)
ORDER BY date`,
    renderNote: 'SQL 返回多行数据。第 1 列 → X 轴标签，其余数值列（最多 5 列）→ 各自一条折线。列名自动转为中文友好标签。日期建议返回 DATE 或 VARCHAR(10) 格式。',
  },
  pass_distribution: {
    title: '达标率分布图',
    displayType: '推荐 display_type: doughnut_chart',
    columns: [
      ['name',  '分组名称（扇形标签）', 'VARCHAR'],
      ['count', '项目数量（扇形大小）', 'INT'],
    ],
    example: `SELECT
  CASE
    WHEN pass_rate >= 95 THEN '达标 (≥95%)'
    WHEN pass_rate >= 85 THEN '警告 (85-95%)'
    ELSE '超时 (<85%)'
  END AS name,
  COUNT(*) AS count
FROM (
  SELECT item_name,
    CAST(SUM(CASE WHEN is_pass = 1 THEN 1 ELSE 0 END) * 100.0
         / COUNT(*) AS DECIMAL(5,1)) AS pass_rate
  FROM tat_records
  WHERE record_date >= DATEADD(DAY, -30, GETDATE())
  GROUP BY item_name
) t
GROUP BY CASE
  WHEN pass_rate >= 95 THEN '达标 (≥95%)'
  WHEN pass_rate >= 85 THEN '警告 (85-95%)'
  ELSE '超时 (<85%)'
END`,
    renderNote: 'SQL 返回分组统计行。第 1 列 → 环形图各扇形标签，第 1 个数值列 → 扇形大小。环形图中央显示所有数值的平均值。',
  },
  item_comparison: {
    title: '项目对比图',
    displayType: '推荐 display_type: bar_chart',
    columns: [
      ['item_name', '项目名称（X 轴分组）', 'VARCHAR'],
      ['pre_tat',   '实验前 TAT（柱组1）',  'DECIMAL'],
      ['intra_tat', '实验内 TAT（柱组2）',  'DECIMAL'],
    ],
    example: `SELECT
  item_name,
  AVG(pre_tat_min) AS pre_tat,
  AVG(intra_tat_min) AS intra_tat
FROM tat_records
WHERE record_date >= DATEADD(DAY, -30, GETDATE())
GROUP BY item_name
ORDER BY item_name`,
    renderNote: 'SQL 返回多行数据。第 1 列 → X 轴分组标签，其余数值列（最多 4 列）→ 各自一组柱子。列名自动转为中文友好标签。',
  },
  detail_table: {
    title: '明细数据表',
    displayType: '推荐 display_type: table',
    columns: [
      ['item_name',     '项目名称（第1列高亮）', 'VARCHAR'],
      ['...',           '其他任意列',            '—'],
    ],
    example: `SELECT
  item_name        AS 项目名称,
  AVG(pre_tat_min) AS 实验前TAT,
  AVG(intra_tat_min) AS 实验内TAT,
  AVG(pre_tat_min) + AVG(intra_tat_min) AS 总TAT,
  COUNT(*)         AS 样本数,
  CAST(SUM(CASE WHEN is_pass = 1 THEN 1 ELSE 0 END) * 100.0
       / COUNT(*) AS DECIMAL(5,1)) AS 达标率
FROM tat_records
WHERE record_date >= DATEADD(DAY, -30, GETDATE())
GROUP BY item_name
ORDER BY item_name`,
    renderNote: 'SQL 返回多行数据（最多显示 200 行）。所有列自动成为表格列头。第 1 列加粗高亮作为标识列。建议用 AS 给列起中文别名以显示友好表头。',
  },
};

function updateSqlGuide(targetModule) {
  const panel = document.getElementById('sqlGuidePanel');
  if (!panel) return;
  const guide = SQL_GUIDES[targetModule];

  if (!guide) {
    panel.style.display = 'none';
    return;
  }

  document.getElementById('sqlGuideTitle').textContent = guide.title;
  document.getElementById('sqlGuideDisplayType').textContent = guide.displayType;
  document.getElementById('sqlGuideColsTbody').innerHTML = guide.columns.map(c =>
    `<tr><td><code>${c[0]}</code></td><td>${c[1]}</td><td style="color:var(--text-secondary);">${c[2]}</td></tr>`
  ).join('');
  document.getElementById('sqlGuideExample').textContent = guide.example;
  document.getElementById('sqlGuideRenderNote').textContent = guide.renderNote;
  panel.style.display = 'block';
}

// ========== 工具函数 ==========
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escJs(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// 值→中文标签映射
function targetModuleLabel(val) {
  const map = {
    kpi_summary: 'KPI 概览卡片',
    trend_chart: '30天趋势图',
    pass_distribution: '达标率分布图',
    item_comparison: '项目对比图',
    detail_table: '明细数据表',
  };
  return map[val] || val || '—';
}

function displayTypeLabel(val) {
  const map = {
    number: '数值',
    table: '表格',
    line_chart: '折线图',
    bar_chart: '柱状图',
    doughnut_chart: '环形图',
  };
  return map[val] || val || '—';
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  renderUserInfo();
  document.getElementById('sidebarUserName').textContent =
    (getUser()?.display_name || getUser()?.username || '—');

  // 加载默认 Tab 数据
  loadSources();
  loadQueries();

  // Tab 切换
  document.querySelectorAll('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    });
  });

  // 搜索：回车触发
  document.getElementById('srcSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadSources(e.target.value);
  });
  document.getElementById('querySearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadQueries(
      document.getElementById('querySourceFilter')?.value || '',
      e.target.value
    );
  });

  // 查询Tab数据源筛选变化
  document.getElementById('querySourceFilter').addEventListener('change', function () {
    loadQueries(this.value, document.getElementById('querySearchInput')?.value || '');
  });

  // 目标子模块切换 → 显示 SQL 编写指南
  document.getElementById('editQueryTargetModule').addEventListener('change', function () {
    updateSqlGuide(this.value);
  });

  // 点击模态框遮罩关闭
  document.getElementById('srcModal').addEventListener('click', function (e) {
    if (e.target === this) closeSourceDialog();
  });
  document.getElementById('queryModal').addEventListener('click', function (e) {
    if (e.target === this) closeQueryDialog();
  });
});

// 供 group 切换后刷新当前 tab
window.refreshPageData = function () {
  loadSources();
  loadQueries();
};

// ============================================
// 数据库连接源 — CRUD
// ============================================

async function loadSources(searchTerm) {
  const tbody = document.getElementById('srcTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#9ca3af;">加载中...</td></tr>';

  try {
    const params = new URLSearchParams();
    if (searchTerm && searchTerm.trim()) {
      params.set('search', searchTerm.trim());
    }
    let url = '/monitor-config/sources';
    const qs = params.toString();
    if (qs) url += '?' + qs;

    const resp = await http.get(url);
    if (!resp || resp.code !== 200) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
      return;
    }

    const data = resp.data || [];
    if (data.length === 0) {
      const msg = searchTerm ? '未找到匹配的数据源' : '暂无数据源，点击「新增连接」添加';
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:#9ca3af;">${msg}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(item => {
      const statusHtml = item.is_active
        ? '<span class="status-badge enabled">启用</span>'
        : '<span class="status-badge disabled">停用</span>';
      return `
        <tr>
          <td><strong>${esc(item.name)}</strong></td>
          <td>${esc(item.server)}</td>
          <td>${item.port || 1433}</td>
          <td>${esc(item.database_name)}</td>
          <td>${esc(item.username)}</td>
          <td>${statusHtml}</td>
          <td>
            <span style="font-size:12px;color:#9ca3af;">${new Date(item.created_at).toLocaleString('zh-CN')}</span>
          </td>
          <td>
            <button class="btn-icon" title="编辑" onclick="openSourceDialog(${item.id})"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-icon delete" title="删除" onclick="deleteSource(${item.id},'${escJs(item.name)}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('加载数据源列表失败:', err);
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
  }
}

async function openSourceDialog(id) {
  const modal = document.getElementById('srcModal');
  const title = document.getElementById('srcModalTitle');

  // 重置表单
  document.getElementById('editSrcId').value = '';
  document.getElementById('editSrcName').value = '';
  document.getElementById('editSrcServer').value = '';
  document.getElementById('editSrcPort').value = '1433';
  document.getElementById('editSrcDatabase').value = '';
  document.getElementById('editSrcUsername').value = '';
  document.getElementById('editSrcPassword').value = '';
  document.getElementById('editSrcActive').value = '1';

  if (id) {
    // 编辑模式 — 加载详情
    title.textContent = '编辑数据库连接';
    try {
      const resp = await http.get('/monitor-config/sources/' + id);
      if (resp && resp.code === 200) {
        const item = resp.data;
        document.getElementById('editSrcId').value = item.id;
        document.getElementById('editSrcName').value = item.name;
        document.getElementById('editSrcServer').value = item.server;
        document.getElementById('editSrcPort').value = item.port;
        document.getElementById('editSrcDatabase').value = item.database_name;
        document.getElementById('editSrcUsername').value = item.username;
        document.getElementById('editSrcPassword').value = item.password || '';
        document.getElementById('editSrcActive').value = item.is_active ? '1' : '0';
      }
    } catch (err) {
      console.error('加载数据源详情失败:', err);
      showToast('加载数据源详情失败', 'error');
      return;
    }
  } else {
    title.textContent = '新增数据库连接';
  }

  modal.style.display = 'flex';
}

function closeSourceDialog() {
  document.getElementById('srcModal').style.display = 'none';
}

async function saveSource() {
  const id = document.getElementById('editSrcId').value;
  const name = document.getElementById('editSrcName').value.trim();
  const server = document.getElementById('editSrcServer').value.trim();
  const port = document.getElementById('editSrcPort').value;
  const database_name = document.getElementById('editSrcDatabase').value.trim();
  const username = document.getElementById('editSrcUsername').value.trim();
  const password = document.getElementById('editSrcPassword').value;
  const is_active = document.getElementById('editSrcActive').value === '1';

  // 验证
  if (!name) { showToast('请输入连接名称', 'error'); return; }
  if (!server) { showToast('请输入服务器地址', 'error'); return; }
  if (!database_name) { showToast('请输入数据库名称', 'error'); return; }
  if (!username) { showToast('请输入用户名', 'error'); return; }
  if (!id && !password) { showToast('请输入密码', 'error'); return; }

  const payload = { name, server, port: parseInt(port, 10) || 1433, database_name, username, is_active };
  if (password) {
    payload.password = password;
  }

  try {
    let resp;
    if (id) {
      resp = await http.put('/monitor-config/sources/' + id, payload);
    } else {
      resp = await http.post('/monitor-config/sources', payload);
    }
    if (resp && resp.code === 200) {
      showToast(id ? '数据源更新成功' : '数据源添加成功', 'success');
      closeSourceDialog();
      loadSources(document.getElementById('srcSearchInput')?.value || '');
    } else {
      showToast(resp?.message || '操作失败', 'error');
    }
  } catch (err) {
    console.error('保存数据源失败:', err);
    showToast('保存失败', 'error');
  }
}

async function deleteSource(id, name) {
  showModal('确认删除', `确定要删除数据源「${name}」吗？此操作不可恢复。`, async () => {
    try {
      const resp = await http.del('/monitor-config/sources/' + id);
      if (resp && resp.code === 200) {
        showToast('数据源删除成功', 'success');
        document.querySelector('.modal-overlay:not([style*="none"])')?.remove?.();
        loadSources(document.getElementById('srcSearchInput')?.value || '');
      } else {
        showToast(resp?.message || '删除失败', 'error');
      }
    } catch (err) {
      console.error('删除数据源失败:', err);
      showToast('删除失败', 'error');
    }
  });
}

async function testConnection() {
  const server = document.getElementById('editSrcServer').value.trim();
  const port = document.getElementById('editSrcPort').value;
  const database_name = document.getElementById('editSrcDatabase').value.trim();
  const username = document.getElementById('editSrcUsername').value.trim();
  const password = document.getElementById('editSrcPassword').value;

  if (!server || !database_name || !username || !password) {
    showToast('请先填写完整的连接信息', 'error');
    return;
  }

  try {
    const resp = await http.post('/monitor-config/sources/test', {
      server, port: parseInt(port, 10) || 1433, database_name, username, password,
    });
    if (resp && resp.code === 200) {
      showToast(`连接成功（延迟 ${resp.data?.latency_ms || '—'} ms）`, 'success');
    } else {
      showToast(resp?.message || '连接失败', 'error');
    }
  } catch (err) {
    console.error('测试连接失败:', err);
    showToast('测试连接请求失败', 'error');
  }
}

// ============================================
// SQL查询配置 — CRUD
// ============================================

async function loadSourceOptions(selectedId) {
  const selectEl = document.getElementById('editQuerySourceId');
  if (!selectEl) return;
  try {
    const resp = await http.get('/monitor-config/sources');
    if (resp && resp.code === 200) {
      const activeSources = (resp.data || []).filter(s => s.is_active);
      if (activeSources.length === 0) {
        selectEl.innerHTML = '<option value="">暂无可用数据源</option>';
      } else {
        selectEl.innerHTML = '<option value="">请选择数据源</option>' +
          activeSources.map(s => `<option value="${s.id}" ${s.id == selectedId ? 'selected' : ''}>${esc(s.name)} (${esc(s.server)})</option>`).join('');
      }
    }
  } catch (err) {
    console.error('加载数据源选项失败:', err);
  }
}

async function loadSourceFilter() {
  const selectEl = document.getElementById('querySourceFilter');
  if (!selectEl) return;
  try {
    const resp = await http.get('/monitor-config/sources');
    if (resp && resp.code === 200) {
      const sources = resp.data || [];
      selectEl.innerHTML = '<option value="">全部数据源</option>' +
        sources.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    }
  } catch (err) {
    console.error('加载数据源筛选失败:', err);
  }
}

async function loadQueries(sourceIdFilter, searchTerm) {
  const tbody = document.getElementById('queryTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#9ca3af;">加载中...</td></tr>';

  // 同时刷新筛选下拉
  loadSourceFilter();

  try {
    const params = new URLSearchParams();
    if (sourceIdFilter) {
      params.set('source_id', sourceIdFilter);
    }
    if (searchTerm && searchTerm.trim()) {
      params.set('search', searchTerm.trim());
    }
    let url = '/monitor-config/queries';
    const qs = params.toString();
    if (qs) url += '?' + qs;

    const resp = await http.get(url);
    if (!resp || resp.code !== 200) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
      return;
    }

    const data = resp.data || [];
    if (data.length === 0) {
      const msg = (sourceIdFilter || searchTerm) ? '未找到匹配的查询配置' : '暂无查询配置，点击「新增查询」添加';
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:#9ca3af;">${msg}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(item => {
      const statusHtml = item.is_active
        ? '<span class="status-badge enabled">启用</span>'
        : '<span class="status-badge disabled">停用</span>';
      const sqlPreview = (item.sql_query || '').length > 60
        ? esc(item.sql_query.substring(0, 60)) + '...'
        : esc(item.sql_query || '');
      return `
        <tr>
          <td><strong>${esc(item.name)}</strong></td>
          <td>${esc(item.source_name || '—')}</td>
          <td>${esc(item.query_category || '—')}</td>
          <td><span class="sql-preview" title="${escJs(item.sql_query || '')}">${sqlPreview}</span></td>
          <td>${esc(targetModuleLabel(item.target_module))}</td>
          <td>${esc(displayTypeLabel(item.display_type))}</td>
          <td>${statusHtml}</td>
          <td>
            <span style="font-size:12px;color:#9ca3af;">${new Date(item.created_at).toLocaleString('zh-CN')}</span>
          </td>
          <td>
            <button class="btn-icon" title="编辑" onclick="openQueryDialog(${item.id})"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-icon delete" title="删除" onclick="deleteQuery(${item.id},'${escJs(item.name)}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('加载查询配置列表失败:', err);
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
  }
}

async function openQueryDialog(id) {
  const modal = document.getElementById('queryModal');
  const title = document.getElementById('queryModalTitle');

  // 重置表单
  document.getElementById('editQueryId').value = '';
  document.getElementById('editQueryName').value = '';
  document.getElementById('editQuerySql').value = '';
  document.getElementById('editQueryCategory').value = '';
  document.getElementById('editQueryTargetModule').value = '';
  document.getElementById('editQueryDisplayType').value = '';
  document.getElementById('editQueryActive').value = '1';
  document.getElementById('queryTestResult').style.display = 'none';
  document.getElementById('queryTestOutput').textContent = '';

  // 加载数据源选项
  await loadSourceOptions('');

  if (id) {
    title.textContent = '编辑SQL查询配置';
    try {
      const resp = await http.get('/monitor-config/queries/' + id);
      if (resp && resp.code === 200) {
        const item = resp.data;
        document.getElementById('editQueryId').value = item.id;
        document.getElementById('editQueryName').value = item.name;
        document.getElementById('editQuerySql').value = item.sql_query || '';
        document.getElementById('editQueryCategory').value = item.query_category || '';
        document.getElementById('editQueryTargetModule').value = item.target_module || '';
        document.getElementById('editQueryDisplayType').value = item.display_type || '';
        document.getElementById('editQueryActive').value = item.is_active ? '1' : '0';
        await loadSourceOptions(item.source_id);
      }
    } catch (err) {
      console.error('加载查询配置详情失败:', err);
      showToast('加载查询配置详情失败', 'error');
      return;
    }
  } else {
    title.textContent = '新增SQL查询配置';
    // 新增模式也触发一次（显示空选择时的隐藏状态）
    updateSqlGuide('');
  }

  // 编辑模式下更新指南
  if (id) {
    updateSqlGuide(document.getElementById('editQueryTargetModule').value);
  }

  modal.style.display = 'flex';
}

function closeQueryDialog() {
  document.getElementById('queryModal').style.display = 'none';
  // 隐藏 SQL 指南面板
  const guidePanel = document.getElementById('sqlGuidePanel');
  if (guidePanel) guidePanel.style.display = 'none';
}

async function saveQuery() {
  const id = document.getElementById('editQueryId').value;
  const source_id = document.getElementById('editQuerySourceId').value;
  const name = document.getElementById('editQueryName').value.trim();
  const sql_query = document.getElementById('editQuerySql').value.trim();
  const query_category = document.getElementById('editQueryCategory').value.trim();
  const target_module = document.getElementById('editQueryTargetModule').value;
  const display_type = document.getElementById('editQueryDisplayType').value;
  const is_active = document.getElementById('editQueryActive').value === '1';

  if (!source_id) { showToast('请选择数据源', 'error'); return; }
  if (!name) { showToast('请输入查询名称', 'error'); return; }
  if (!sql_query) { showToast('请输入SQL查询语句', 'error'); return; }

  const payload = { source_id: parseInt(source_id, 10), name, sql_query, query_category: query_category || null, target_module: target_module || null, display_type: display_type || null, is_active };

  try {
    let resp;
    if (id) {
      resp = await http.put('/monitor-config/queries/' + id, payload);
    } else {
      resp = await http.post('/monitor-config/queries', payload);
    }
    if (resp && resp.code === 200) {
      showToast(id ? '查询配置更新成功' : '查询配置添加成功', 'success');
      closeQueryDialog();
      loadQueries(
        document.getElementById('querySourceFilter')?.value || '',
        document.getElementById('querySearchInput')?.value || ''
      );
    } else {
      showToast(resp?.message || '操作失败', 'error');
    }
  } catch (err) {
    console.error('保存查询配置失败:', err);
    showToast('保存失败', 'error');
  }
}

async function deleteQuery(id, name) {
  showModal('确认删除', `确定要删除查询配置「${name}」吗？此操作不可恢复。`, async () => {
    try {
      const resp = await http.del('/monitor-config/queries/' + id);
      if (resp && resp.code === 200) {
        showToast('查询配置删除成功', 'success');
        document.querySelector('.modal-overlay:not([style*="none"])')?.remove?.();
        loadQueries(
          document.getElementById('querySourceFilter')?.value || '',
          document.getElementById('querySearchInput')?.value || ''
        );
      } else {
        showToast(resp?.message || '删除失败', 'error');
      }
    } catch (err) {
      console.error('删除查询配置失败:', err);
      showToast('删除失败', 'error');
    }
  });
}

async function testQuery() {
  const source_id = document.getElementById('editQuerySourceId').value;
  const sql_query = document.getElementById('editQuerySql').value.trim();
  const resultDiv = document.getElementById('queryTestResult');
  const outputPre = document.getElementById('queryTestOutput');

  if (!source_id) { showToast('请先选择数据源', 'error'); return; }
  if (!sql_query) { showToast('请输入SQL查询语句', 'error'); return; }

  resultDiv.style.display = 'block';
  outputPre.textContent = '执行中...';
  outputPre.className = '';

  try {
    const resp = await http.post('/monitor-config/queries/test', {
      source_id: parseInt(source_id, 10),
      sql_query,
    });
    if (resp && resp.code === 200) {
      const d = resp.data;
      let text = JSON.stringify(d.recordset, null, 2);
      if (d.truncated) {
        text += `\n\n（结果已截断，共 ${d.rowCount} 行，仅显示前 100 行）`;
      }
      outputPre.textContent = text;
      outputPre.className = 'success';
    } else {
      outputPre.textContent = resp?.message || '查询执行失败';
      outputPre.className = 'error';
    }
  } catch (err) {
    console.error('测试查询失败:', err);
    outputPre.textContent = '请求失败: ' + err.message;
    outputPre.className = 'error';
  }
}
