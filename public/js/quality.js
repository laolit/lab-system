/* ========================================
   TAT 质量监控 — 全动态配置驱动渲染
   支持同一 target_module 多个配置并行展示
   ======================================== */

// 所有 Chart 实例统一管理
let chartInstances = [];

// KPI 卡片主题色（8色轮换）
const KPI_THEMES = [
  { cls: 'pre',   icon: 'fa-vial-circle-check', color: '#a5b4fc', bg: 'rgba(99,102,241,0.15)' },
  { cls: 'intra', icon: 'fa-flask',             color: '#5eead4', bg: 'rgba(13,148,136,0.15)' },
  { cls: 'pass',  icon: 'fa-circle-check',      color: '#93c5fd', bg: 'rgba(37,99,235,0.15)' },
  { cls: 'total', icon: 'fa-database',          color: '#c4b5fd', bg: 'rgba(124,58,237,0.15)' },
  { cls: 'alt1',  icon: 'fa-clock',             color: '#fbbf24', bg: 'rgba(245,158,11,0.15)' },
  { cls: 'alt2',  icon: 'fa-chart-simple',      color: '#f472b6', bg: 'rgba(236,72,153,0.15)' },
  { cls: 'alt3',  icon: 'fa-percent',           color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
  { cls: 'alt4',  icon: 'fa-layer-group',       color: '#fb923c', bg: 'rgba(251,146,60,0.15)' },
];

// 图标的模块化前缀（生成唯一 canvas id 用）
let canvasSeq = 0;

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  renderUserInfo();
  document.getElementById('sidebarUserName').textContent =
    ((getUser() || {}).display_name || (getUser() || {}).username || '—');
  loadTATDashboard();
});

// ============================================
// 主加载入口
// ============================================
async function loadTATDashboard() {
  try {
    const [dynResp, mockResp] = await Promise.allSettled([
      http.get('/quality/dashboard-data'),
      http.get('/quality/tat-dashboard'),
    ]);

    const dynData = (dynResp.status === 'fulfilled' && (dynResp.value || {}).code === 200)
      ? dynResp.value.data : null;
    const mockData = (mockResp.status === 'fulfilled' && (mockResp.value || {}).code === 200)
      ? mockResp.value.data : null;

    const modules = (dynData || {}).modules || {};

    // 销毁所有旧图表
    destroyAllCharts();
    canvasSeq = 0;

    // 清空容器
    const kpiGrid = document.getElementById('kpiGrid');
    const chartsArea = document.getElementById('dynamicChartsArea');
    if (kpiGrid) kpiGrid.innerHTML = '';
    if (chartsArea) chartsArea.innerHTML = '';

    // ---- 1. KPI 卡片 ----
    if (modules.kpi_summary && modules.kpi_summary.length > 0) {
      renderKpiCards(modules.kpi_summary);
    } else if (mockData) {
      renderMockKpiCards(mockData.summary);
    }

    // ---- 2 & 3. 折线图 + 环形图（同一行，2:1 网格布局） ----
    const trendConfigs = (modules.trend_chart && modules.trend_chart.length > 0)
      ? modules.trend_chart.filter(c => c.data && c.data.length > 0 && !c.error)
      : [];
    const doughnutConfigs = (modules.pass_distribution && modules.pass_distribution.length > 0)
      ? modules.pass_distribution.filter(c => c.data && c.data.length > 0 && !c.error)
      : [];

    if (trendConfigs.length === 0 && doughnutConfigs.length === 0 && mockData) {
      // Mock：趋势图 + 环形图放在同一行
      const row = startChartRow();
      const trendCid = nextCanvasId();
      const doughCid = nextCanvasId();
      appendToRow(row, createChartCardHTML(trendCid, '近30天 TAT 趋势', 'fa-chart-line', 320));
      appendToRow(row, createDoughnutCardHTML(doughCid, '项目达标率分布', 'fa-chart-pie'));
      renderMockTrendChart(trendCid, mockData.trend);
      renderMockDoughnutChart(doughCid, mockData.items, mockData.summary.pass_rate);
    } else {
      // 动态配置：按最大数量配对，折线图左 环形图右
      const maxLen = Math.max(trendConfigs.length, doughnutConfigs.length);
      for (let i = 0; i < maxLen; i++) {
        const hasTrend = i < trendConfigs.length;
        const hasDoughnut = i < doughnutConfigs.length;
        const row = startChartRow(!(hasTrend && hasDoughnut)); // 只有一个时用 single 占满行
        if (hasTrend) {
          const cid = nextCanvasId();
          appendToRow(row, createChartCardHTML(cid, trendConfigs[i].name, 'fa-chart-line', 320));
          renderLineChart(cid, trendConfigs[i]);
        }
        if (hasDoughnut) {
          const cid = nextCanvasId();
          appendToRow(row, createDoughnutCardHTML(cid, doughnutConfigs[i].name, 'fa-chart-pie'));
          renderDoughnutChart(cid, doughnutConfigs[i]);
        }
      }
    }

    // ---- 4. 柱状图 ----
    const barConfigs = (modules.item_comparison && modules.item_comparison.length > 0)
      ? modules.item_comparison.filter(c => c.data && c.data.length > 0 && !c.error)
      : [];
    if (barConfigs.length === 0 && mockData) {
      renderMockBarCard(mockData.items);
    } else {
      barConfigs.forEach(cfg => appendBarChartCard(cfg));
    }

    // ---- 5. 明细表 ----
    const tableConfigs = (modules.detail_table && modules.detail_table.length > 0)
      ? modules.detail_table.filter(c => c.data && c.data.length > 0 && !c.error)
      : [];
    if (tableConfigs.length === 0 && mockData) {
      renderMockTableCard(mockData.items);
    } else {
      tableConfigs.forEach(cfg => appendTableCard(cfg));
    }

    // ---- 6. 未归类模块也渲染 ----
    const renderedModules = ['kpi_summary', 'trend_chart', 'pass_distribution', 'item_comparison', 'detail_table'];
    Object.keys(modules).forEach(modKey => {
      if (renderedModules.includes(modKey)) return;
      const configs = modules[modKey].filter(c => c.data && c.data.length > 0 && !c.error);
      configs.forEach(cfg => {
        // 按 target_module 决定渲染方式
        if (cfg.target_module === 'detail_table') {
          appendTableCard(cfg);
        } else if (cfg.target_module === 'item_comparison') {
          appendBarChartCard(cfg);
        } else if (cfg.target_module === 'pass_distribution') {
          appendDoughnutChartCard(cfg);
        } else {
          appendLineChartCard(cfg);
        }
      });
    });

    if (!dynData && !mockData) {
      showToast('TAT 数据加载失败', 'error');
    }
  } catch (err) {
    console.error('加载 TAT 数据失败:', err);
    showToast('TAT 数据加载失败', 'error');
  }
}

// ============================================
// 图表实例管理
// ============================================
function destroyAllCharts() {
  chartInstances.forEach(c => { try { c.destroy(); } catch (e) { /* ignore */ } });
  chartInstances = [];
}

function trackChart(chart) {
  chartInstances.push(chart);
}

// ============================================
// DOM 构建工具
// ============================================
function nextCanvasId() { return 'dynChart_' + (++canvasSeq); }

function createChartCardHTML(canvasId, title, icon, height) {
  return `
    <div class="chart-card">
      <div class="chart-title"><i class="fa-solid ${icon}"></i> ${esc(title)}</div>
      <div class="chart-wrap" style="height:${height}px;">
        <canvas id="${canvasId}"></canvas>
      </div>
    </div>`;
}

function createDoughnutCardHTML(canvasId, title, icon) {
  return `
    <div class="chart-card">
      <div class="chart-title"><i class="fa-solid ${icon}"></i> ${esc(title)}</div>
      <div class="chart-wrap" style="height:320px;position:relative;">
        <canvas id="${canvasId}"></canvas>
        <div class="doughnut-center">
          <div class="center-value" id="${canvasId}_center">—</div>
          <div class="center-label">综合达标率</div>
        </div>
      </div>
    </div>`;
}

function appendToChartsArea(html) {
  const area = document.getElementById('dynamicChartsArea');
  if (!area) return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-row single';
  wrapper.innerHTML = html;
  area.appendChild(wrapper);
  return wrapper;
}

function appendRowToChartsArea(html) {
  const area = document.getElementById('dynamicChartsArea');
  if (!area) return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-row';
  wrapper.innerHTML = html;
  area.appendChild(wrapper);
  return wrapper;
}

// 创建一条 chart-row 并返回其 DOM 元素（用于逐步往里塞卡片）
function startChartRow(single) {
  const area = document.getElementById('dynamicChartsArea');
  if (!area) return null;
  const wrapper = document.createElement('div');
  wrapper.className = single ? 'chart-row single' : 'chart-row';
  area.appendChild(wrapper);
  return wrapper;
}

// 向已有 row 容器中追加 HTML
function appendToRow(rowEl, html) {
  if (!rowEl) return;
  const temp = document.createElement('div');
  temp.innerHTML = html;
  while (temp.firstChild) {
    rowEl.appendChild(temp.firstChild);
  }
}

// ============================================
// KPI 卡片渲染（支持多个配置）
// ============================================
function renderKpiCards(configs) {
  const grid = document.getElementById('kpiGrid');
  if (!grid) return;

  const cards = [];
  configs.forEach(cfg => {
    if (!cfg.data || cfg.data.length === 0) return;
    const row = cfg.data[0];
    const keys = Object.keys(row);

    if (keys.length === 1) {
      cards.push({ label: cfg.name, value: row[keys[0]], theme: KPI_THEMES[cards.length % KPI_THEMES.length] });
    } else {
      keys.forEach(key => {
        const val = row[key];
        if (typeof val === 'number' || (typeof val === 'string' && !isNaN(val) && val !== '')) {
          cards.push({ label: colNameToLabel(key), value: typeof val === 'string' ? parseFloat(val) : val, theme: KPI_THEMES[cards.length % KPI_THEMES.length] });
        }
      });
    }
  });

  if (cards.length === 0) return;

  grid.innerHTML = cards.map(c => `
    <div class="kpi-card ${c.theme.cls} dyn-kpi">
      <div class="kpi-icon"><i class="fa-solid ${c.theme.icon}"></i></div>
      <div class="kpi-label">${esc(c.label)}</div>
      <div class="kpi-value" style="color:${c.theme.color};">${formatKpiValue(c.value)}</div>
      <div class="kpi-sub">数据来源: 动态配置</div>
    </div>
  `).join('');

  // 动画
  cards.forEach((c, i) => {
    const el = grid.querySelectorAll('.kpi-value')[i];
    if (el) animateKPIElement(el, c.value);
  });
}

function renderMockKpiCards(summary) {
  const grid = document.getElementById('kpiGrid');
  if (!grid) return;
  grid.innerHTML = `
    <div class="kpi-card pre"  ><div class="kpi-icon"><i class="fa-solid fa-vial-circle-check"></i></div><div class="kpi-label">平均实验前 TAT</div><div class="kpi-value" id="kpiPreTAT">—</div><div class="kpi-sub">样本采集 → 实验室接收</div></div>
    <div class="kpi-card intra"><div class="kpi-icon"><i class="fa-solid fa-flask"></i></div><div class="kpi-label">平均实验内 TAT</div><div class="kpi-value" id="kpiIntraTAT">—</div><div class="kpi-sub">实验室接收 → 结果报告</div></div>
    <div class="kpi-card pass" ><div class="kpi-icon"><i class="fa-solid fa-circle-check"></i></div><div class="kpi-label">总达标率</div><div class="kpi-value" id="kpiPassRate">—</div><div class="kpi-sub">所有项目加权平均</div></div>
    <div class="kpi-card total"><div class="kpi-icon"><i class="fa-solid fa-database"></i></div><div class="kpi-label">总样本数</div><div class="kpi-value" id="kpiSamples">—</div><div class="kpi-sub">近30天统计</div></div>
  `;
  animateKPI('kpiPreTAT', summary.avg_pre_tat, 'min');
  animateKPI('kpiIntraTAT', summary.avg_intra_tat, 'min');
  animateKPI('kpiPassRate', summary.pass_rate, '%');
  animateKPI('kpiSamples', summary.total_samples, '');
}

// ============================================
// 折线图 — 每个 config 一张独立卡片
// ============================================
function appendLineChartCard(cfg) {
  const cid = nextCanvasId();
  appendRowToChartsArea(createChartCardHTML(cid, cfg.name, 'fa-chart-line', 320));
  renderLineChart(cid, cfg);
}

function renderLineChart(canvasId, cfg) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const data = cfg.data;
  const columns = cfg.columns || Object.keys(data[0]);
  const numCols = columns.filter(c => typeof data[0][c] === 'number');
  const seriesCols = numCols.slice(0, 5);
  if (seriesCols.length === 0) seriesCols.push(columns[1] || columns[0]);
  const labels = data.map(r => String(r[columns[0]] || ''));

  const lineColors = ['#818cf8', '#22d3bb', '#fbbf24', '#f472b6', '#34d399'];

  const datasets = seriesCols.map((col, i) => {
    const grad = ctx.createLinearGradient(0, 0, 0, 320);
    grad.addColorStop(0, lineColors[i % 5] + '40');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    return {
      label: colNameToLabel(col),
      data: data.map(r => parseFloat(r[col]) || 0),
      borderColor: lineColors[i % 5],
      backgroundColor: grad,
      borderWidth: 2, pointRadius: 2, pointHoverRadius: 5,
      pointBackgroundColor: lineColors[i % 5],
      tension: 0.4, fill: true,
    };
  });

  const chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { color: 'rgba(255,255,255,0.6)', usePointStyle: true, pointStyleWidth: 8, padding: 20, font: { size: 12 } } },
        tooltip: { backgroundColor: 'rgba(15,20,40,0.95)', titleColor: '#e2e8f0', bodyColor: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12, cornerRadius: 8 },
      },
      scales: {
        x: { grid: darkGrid, ticks: { ...darkTicks, maxTicksLimit: 10 } },
        y: { grid: darkGrid, ticks: { ...darkTicks }, title: { display: true, text: colNameToLabel(seriesCols[0] || ''), color: 'rgba(255,255,255,0.4)', font: { size: 11 } } },
      },
    },
  });
  trackChart(chart);
}

function renderMockTrendCard(trend) {
  const cid = nextCanvasId();
  appendRowToChartsArea(createChartCardHTML(cid, '近30天 TAT 趋势', 'fa-chart-line', 320));
  renderMockTrendChart(cid, trend);
}

function renderMockTrendChart(canvasId, trend) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const labels = trend.map(t => t.date.slice(5));
  const preData = trend.map(t => t.avg_pre_tat);
  const intraData = trend.map(t => t.avg_intra_tat);

  const gradPre = ctx.createLinearGradient(0, 0, 0, 320);
  gradPre.addColorStop(0, 'rgba(129, 140, 248, 0.25)');
  gradPre.addColorStop(1, 'rgba(129, 140, 248, 0.0)');
  const gradIntra = ctx.createLinearGradient(0, 0, 0, 320);
  gradIntra.addColorStop(0, 'rgba(34, 211, 187, 0.20)');
  gradIntra.addColorStop(1, 'rgba(34, 211, 187, 0.0)');

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '实验前 TAT', data: preData, borderColor: '#818cf8', backgroundColor: gradPre, borderWidth: 2, pointRadius: 2, pointHoverRadius: 5, pointBackgroundColor: '#818cf8', tension: 0.4, fill: true },
        { label: '实验内 TAT', data: intraData, borderColor: '#22d3bb', backgroundColor: gradIntra, borderWidth: 2, pointRadius: 2, pointHoverRadius: 5, pointBackgroundColor: '#22d3bb', tension: 0.4, fill: true },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { color: 'rgba(255,255,255,0.6)', usePointStyle: true, pointStyleWidth: 8, padding: 20, font: { size: 12 } } },
        tooltip: { backgroundColor: 'rgba(15,20,40,0.95)', titleColor: '#e2e8f0', bodyColor: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12, cornerRadius: 8 },
      },
      scales: {
        x: { grid: darkGrid, ticks: { ...darkTicks, maxTicksLimit: 10 } },
        y: { grid: darkGrid, ticks: { ...darkTicks, callback: v => v + ' min' }, title: { display: true, text: '周转时间 (分钟)', color: 'rgba(255,255,255,0.4)', font: { size: 11 } } },
      },
    },
  });
  trackChart(chart);
}

// ============================================
// 环形图 — 每个 config 一张独立卡片
// ============================================
function appendDoughnutChartCard(cfg) {
  const cid = nextCanvasId();
  appendRowToChartsArea(createDoughnutCardHTML(cid, cfg.name, 'fa-chart-pie'));
  renderDoughnutChart(cid, cfg);
}

function renderDoughnutChart(canvasId, cfg) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const data = cfg.data;
  const columns = cfg.columns || Object.keys(data[0]);
  const numCols = columns.filter(c => typeof data[0][c] === 'number');
  const valueCol = numCols.length > 0 ? numCols[0] : (columns[1] || columns[0]);
  const labels = data.map(r => String(r[columns[0]] || ''));
  const values = data.map(r => parseFloat(r[valueCol]) || 0);

  const doughColors = [
    'rgba(74,222,128,0.7)', 'rgba(52,211,153,0.7)', 'rgba(251,191,36,0.7)',
    'rgba(129,140,248,0.7)', 'rgba(244,114,182,0.7)', 'rgba(248,113,113,0.7)',
    'rgba(34,211,187,0.7)', 'rgba(251,146,60,0.7)',
  ];

  const total = values.reduce((s, v) => s + v, 0);
  const avg = values.length > 0 ? Math.round(total / values.length) : 0;
  const centerEl = document.getElementById(canvasId + '_center');
  if (centerEl) centerEl.textContent = avg;

  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: doughColors.slice(0, labels.length),
        borderColor: doughColors.slice(0, labels.length).map(c => c.replace('0.7', '0.3')),
        borderWidth: 2,
        hoverBorderColor: doughColors.slice(0, labels.length).map(c => c.replace('0.7', '0.9')),
        cutout: '70%',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.6)', usePointStyle: true, pointStyleWidth: 8, padding: 16, font: { size: 11 } } },
        tooltip: { backgroundColor: 'rgba(15,20,40,0.95)', titleColor: '#e2e8f0', bodyColor: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12, cornerRadius: 8, callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}` } },
      },
    },
  });
  trackChart(chart);
}

function renderMockDoughnutCard(items, avgPassRate) {
  const cid = nextCanvasId();
  appendRowToChartsArea(createDoughnutCardHTML(cid, '项目达标率分布', 'fa-chart-pie'));
  renderMockDoughnutChart(cid, items, avgPassRate);
}

function renderMockDoughnutChart(canvasId, items, avgPassRate) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const good = items.filter(i => i.pass_rate >= 95).length;
  const warn = items.filter(i => i.pass_rate >= 85 && i.pass_rate < 95).length;
  const bad = items.filter(i => i.pass_rate < 85).length;
  const centerEl = document.getElementById(canvasId + '_center');
  if (centerEl) centerEl.textContent = avgPassRate + '%';

  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['达标 (≥95%)', '警告 (85-95%)', '超时 (<85%)'],
      datasets: [{
        data: [good, warn, bad],
        backgroundColor: ['rgba(74,222,128,0.7)', 'rgba(251,191,36,0.7)', 'rgba(248,113,113,0.7)'],
        borderColor: ['rgba(74,222,128,0.3)', 'rgba(251,191,36,0.3)', 'rgba(248,113,113,0.3)'],
        borderWidth: 2,
        hoverBorderColor: ['rgba(74,222,128,0.8)', 'rgba(251,191,36,0.8)', 'rgba(248,113,113,0.8)'],
        cutout: '70%',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.6)', usePointStyle: true, pointStyleWidth: 8, padding: 16, font: { size: 11 } } },
        tooltip: { backgroundColor: 'rgba(15,20,40,0.95)', titleColor: '#e2e8f0', bodyColor: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12, cornerRadius: 8, callbacks: { label: ctx => `${ctx.label}: ${ctx.raw} 项` } },
      },
    },
  });
  trackChart(chart);
}

// ============================================
// 柱状图 — 每个 config 一张独立卡片
// ============================================
function appendBarChartCard(cfg) {
  const cid = nextCanvasId();
  appendToChartsArea(createChartCardHTML(cid, cfg.name, 'fa-chart-bar', 360));
  renderBarChart(cid, cfg);
}

function renderBarChart(canvasId, cfg) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const data = cfg.data;
  const columns = cfg.columns || Object.keys(data[0]);
  const numCols = columns.filter(c => typeof data[0][c] === 'number');
  const seriesCols = numCols.slice(0, 4);
  if (seriesCols.length === 0) seriesCols.push(columns[1] || columns[0]);
  const labels = data.map(r => String(r[columns[0]] || ''));

  const barColors = ['rgba(129,140,248,0.6)', 'rgba(34,211,187,0.5)', 'rgba(251,191,36,0.5)', 'rgba(244,114,182,0.5)'];
  const barBorders = ['rgba(129,140,248,0.9)', 'rgba(34,211,187,0.8)', 'rgba(251,191,36,0.8)', 'rgba(244,114,182,0.8)'];

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: seriesCols.map((col, i) => ({
        label: colNameToLabel(col),
        data: data.map(r => parseFloat(r[col]) || 0),
        backgroundColor: barColors[i % 4],
        borderColor: barBorders[i % 4],
        borderWidth: 1, borderRadius: 4, borderSkipped: false,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { color: 'rgba(255,255,255,0.6)', usePointStyle: true, pointStyleWidth: 8, padding: 20, font: { size: 12 } } },
        tooltip: { backgroundColor: 'rgba(15,20,40,0.95)', titleColor: '#e2e8f0', bodyColor: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12, cornerRadius: 8 },
      },
      scales: {
        x: { grid: { display: false }, ticks: { ...darkTicks, font: { size: 12 } } },
        y: { grid: darkGrid, ticks: { ...darkTicks }, title: { display: true, text: colNameToLabel(seriesCols[0] || ''), color: 'rgba(255,255,255,0.4)', font: { size: 11 } } },
      },
    },
  });
  trackChart(chart);
}

function renderMockBarCard(items) {
  const cid = nextCanvasId();
  appendToChartsArea(createChartCardHTML(cid, '各检验项目 TAT 对比（实验前 · 实验内）', 'fa-chart-bar', 360));
  const canvas = document.getElementById(cid);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: items.map(i => i.name),
      datasets: [
        { label: '实验前 TAT', data: items.map(i => i.pre_tat), backgroundColor: 'rgba(129,140,248,0.6)', borderColor: 'rgba(129,140,248,0.9)', borderWidth: 1, borderRadius: 4, borderSkipped: false },
        { label: '实验内 TAT', data: items.map(i => i.intra_tat), backgroundColor: 'rgba(34,211,187,0.5)', borderColor: 'rgba(34,211,187,0.8)', borderWidth: 1, borderRadius: 4, borderSkipped: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { color: 'rgba(255,255,255,0.6)', usePointStyle: true, pointStyleWidth: 8, padding: 20, font: { size: 12 } } },
        tooltip: { backgroundColor: 'rgba(15,20,40,0.95)', titleColor: '#e2e8f0', bodyColor: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12, cornerRadius: 8, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} min` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { ...darkTicks, font: { size: 12 } } },
        y: { grid: darkGrid, ticks: { ...darkTicks, callback: v => v + ' min' }, title: { display: true, text: '周转时间 (分钟)', color: 'rgba(255,255,255,0.4)', font: { size: 11 } } },
      },
    },
  });
  trackChart(chart);
}

// ============================================
// 明细表 — 每个 config 一张独立表格
// ============================================
function appendTableCard(cfg) {
  const data = cfg.data;
  const columns = cfg.columns || (data.length > 0 ? Object.keys(data[0]) : []);
  const rows = data.slice(0, 200);

  const headHTML = `<tr>${columns.map(c => `<th>${colNameToLabel(c)}</th>`).join('')}</tr>`;
  const bodyHTML = rows.map(row => `
    <tr>
      ${columns.map((col, ci) => {
        const val = row[col];
        if (val === null || val === undefined) return '<td style="color:rgba(255,255,255,0.25);">—</td>';
        if (ci === 0) return `<td><span style="font-weight:600;color:#e2e8f0;">${esc(String(val))}</span></td>`;
        if (typeof val === 'number') return `<td style="color:#e2e8f0;">${Number.isInteger(val) ? val.toLocaleString() : val.toFixed(1)}</td>`;
        return `<td>${esc(String(val))}</td>`;
      }).join('')}
    </tr>
  `).join('');

  const truncNote = data.length > 200
    ? `<tr><td colspan="${columns.length}" style="text-align:center;padding:12px;color:rgba(255,255,255,0.3);">数据已截断，仅显示前 200 行（共 ${data.length} 行）</td></tr>`
    : '';

  const html = `
    <div class="dark-table-wrap" style="margin-top:0;">
      <div class="chart-title"><i class="fa-solid fa-table-list"></i> ${esc(cfg.name)}</div>
      <div style="overflow-x:auto;padding:0 0 12px;">
        <table class="dark-table">
          <thead>${headHTML}</thead>
          <tbody>${bodyHTML}${truncNote}</tbody>
        </table>
      </div>
    </div>`;

  appendToChartsArea(html);
}

function renderMockTableCard(items) {
  const tbody = items.map(item => {
    let statusClass, statusText;
    if (item.pass_rate >= 95) { statusClass = 'good'; statusText = '达标'; }
    else if (item.pass_rate >= 85) { statusClass = 'warn'; statusText = '警告'; }
    else { statusClass = 'bad'; statusText = '超时'; }
    const barClass = item.pass_rate >= 95 ? 'good' : (item.pass_rate >= 85 ? 'warn' : 'bad');
    const barWidth = Math.min(100, item.pass_rate);

    return `
      <tr>
        <td><span class="item-name">${esc(item.name)}</span><span class="item-code">${item.code}</span></td>
        <td><span class="tat-val pre-color">${item.pre_tat} min</span><span style="color:rgba(255,255,255,0.3);font-size:11px;"> / 目标 ${item.pre_target} min</span></td>
        <td><span class="tat-val intra-color">${item.intra_tat} min</span><span style="color:rgba(255,255,255,0.3);font-size:11px;"> / 目标 ${item.intra_target} min</span></td>
        <td style="font-weight:600;color:#e2e8f0;">${item.total_actual} min</td>
        <td style="color:rgba(255,255,255,0.4);">${item.total_target} min</td>
        <td style="color:rgba(255,255,255,0.5);">${item.samples}</td>
        <td><span style="color:#e2e8f0;font-weight:600;">${item.pass_rate}%</span><span class="mini-bar"><span class="fill ${barClass}" style="width:${barWidth}%;"></span></span></td>
        <td><span class="badge-pass ${statusClass}">${statusText}</span></td>
      </tr>`;
  }).join('');

  const html = `
    <div class="dark-table-wrap" style="margin-top:0;">
      <div class="chart-title"><i class="fa-solid fa-table-list"></i> 重点检验项目 TAT 明细</div>
      <div style="overflow-x:auto;padding:0 0 12px;">
        <table class="dark-table">
          <thead><tr><th>检验项目</th><th>实验前 TAT</th><th>实验内 TAT</th><th>总 TAT</th><th>目标 TAT</th><th>样本数</th><th>达标率</th><th>状态</th></tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
    </div>`;

  appendToChartsArea(html);
}

// ============================================
// KPI 动画
// ============================================
function animateKPI(elId, target, unit) {
  const el = document.getElementById(elId);
  if (!el) return;
  animateKPIElement(el, target, unit);
}

function animateKPIElement(el, target, unit) {
  if (target === undefined || target === null) return;
  const isDecimal = target % 1 !== 0;
  const duration = 800;
  const start = performance.now();

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const val = 1 - Math.pow(1 - progress, 3);
    const current = isDecimal ? (target * val).toFixed(1) : Math.round(target * val);

    if (unit === '%') el.innerHTML = current + '<span class="kpi-unit">%</span>';
    else if (unit === 'min') el.innerHTML = current + '<span class="kpi-unit"> min</span>';
    else el.innerHTML = (typeof current === 'number' ? current.toLocaleString() : current);

    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function formatKpiValue(val) {
  if (val === undefined || val === null) return '—';
  if (typeof val === 'number') {
    if (val % 1 !== 0) return val.toFixed(1);
    return val.toLocaleString();
  }
  return String(val);
}

// ============================================
// 列名 → 中文标签
// ============================================
function colNameToLabel(col) {
  const map = {
    avg_pre_tat: '实验前 TAT', intra_tat: '实验内 TAT', pre_tat: '实验前 TAT',
    avg_intra_tat: '实验内 TAT', pass_rate: '达标率', total_samples: '总样本数',
    name: '名称', code: '编码', date: '日期', samples: '样本数',
    pre_target: '实验前目标', intra_target: '实验内目标', total_actual: '实际总TAT',
    total_target: '目标总TAT', item_name: '项目名称', count: '数量',
    value: '数值', label: '标签', category: '分类',
  };
  return map[col] || col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ============================================
// Chart.js 深色主题
// ============================================
const darkGrid = { color: 'rgba(255,255,255,0.06)' };
const darkTicks = { color: 'rgba(255,255,255,0.4)', font: { size: 11 } };

// ============================================
// 小组切换刷新
// ============================================
window.refreshPageData = async function () {
  await loadTATDashboard();
};

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
