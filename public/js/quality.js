/* ========================================
   TAT 质量监控 — 动态配置驱动 + mock 兜底
   ======================================== */

let trendChart = null;
let doughnutChart = null;
let barChart = null;

// KPI 卡片主题配色轮换
const KPI_THEMES = [
  { cls: 'pre',  icon: 'fa-vial-circle-check',  color: '#a5b4fc', bg: 'rgba(99,102,241,0.15)' },
  { cls: 'intra', icon: 'fa-flask',              color: '#5eead4', bg: 'rgba(13,148,136,0.15)' },
  { cls: 'pass',  icon: 'fa-circle-check',       color: '#93c5fd', bg: 'rgba(37,99,235,0.15)' },
  { cls: 'total', icon: 'fa-database',           color: '#c4b5fd', bg: 'rgba(124,58,237,0.15)' },
  { cls: 'alt1',  icon: 'fa-clock',              color: '#fbbf24', bg: 'rgba(245,158,11,0.15)' },
  { cls: 'alt2',  icon: 'fa-chart-simple',       color: '#f472b6', bg: 'rgba(236,72,153,0.15)' },
  { cls: 'alt3',  icon: 'fa-percent',            color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
  { cls: 'alt4',  icon: 'fa-layer-group',        color: '#fb923c', bg: 'rgba(251,146,60,0.15)' },
];

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  renderUserInfo();
  document.getElementById('sidebarUserName').textContent =
    (getUser()?.display_name || getUser()?.username || '—');

  loadTATDashboard();
});

// ============================================
// 主加载入口
// ============================================
async function loadTATDashboard() {
  try {
    // 并行加载动态配置数据 + mock 兜底数据
    const [dynResp, mockResp] = await Promise.allSettled([
      http.get('/quality/dashboard-data'),
      http.get('/quality/tat-dashboard'),
    ]);

    const dynData = (dynResp.status === 'fulfilled' && dynResp.value?.code === 200)
      ? dynResp.value.data : null;
    const mockData = (mockResp.status === 'fulfilled' && mockResp.value?.code === 200)
      ? mockResp.value.data : null;

    const modules = dynData?.modules || {};

    // --- KPI 卡片 ---
    if (modules.kpi_summary && modules.kpi_summary.length > 0) {
      renderDynamicKpiCards(modules.kpi_summary);
    } else if (mockData) {
      renderMockKpiCards(mockData.summary);
    }

    // --- 折线图（趋势图） ---
    if (modules.trend_chart && modules.trend_chart.length > 0) {
      const cfg = modules.trend_chart[0];
      if (cfg.data && cfg.data.length > 0 && !cfg.error) {
        renderDynamicChart('line', cfg);
      } else if (mockData) {
        renderTrendChart(mockData.trend);
      }
    } else if (mockData) {
      renderTrendChart(mockData.trend);
    }

    // --- 环形图（达标率分布） ---
    if (modules.pass_distribution && modules.pass_distribution.length > 0) {
      const cfg = modules.pass_distribution[0];
      if (cfg.data && cfg.data.length > 0 && !cfg.error) {
        renderDynamicChart('doughnut', cfg);
      } else if (mockData) {
        renderDoughnutChart(mockData.items, mockData.summary.pass_rate);
      }
    } else if (mockData) {
      renderDoughnutChart(mockData.items, mockData.summary.pass_rate);
    }

    // --- 柱状图（项目对比） ---
    if (modules.item_comparison && modules.item_comparison.length > 0) {
      const cfg = modules.item_comparison[0];
      if (cfg.data && cfg.data.length > 0 && !cfg.error) {
        renderDynamicChart('bar', cfg);
      } else if (mockData) {
        renderBarChart(mockData.items);
      }
    } else if (mockData) {
      renderBarChart(mockData.items);
    }

    // --- 明细表 ---
    if (modules.detail_table && modules.detail_table.length > 0) {
      const cfg = modules.detail_table[0];
      if (cfg.data && cfg.data.length > 0 && !cfg.error) {
        renderDynamicTable(cfg);
      } else if (mockData) {
        renderDetailTable(mockData.items);
      }
    } else if (mockData) {
      renderDetailTable(mockData.items);
    }

    // 如果动态数据和 mock 都没拿到，显示错误
    if (!dynData && !mockData) {
      showToast('TAT 数据加载失败', 'error');
    }
  } catch (err) {
    console.error('加载 TAT 数据失败:', err);
    showToast('TAT 数据加载失败', 'error');
  }
}

// ============================================
// 动态 KPI 卡片渲染
// ============================================
function renderDynamicKpiCards(configs) {
  const grid = document.getElementById('kpiGrid');
  if (!grid) return;

  // 从每个配置中提取数值卡片
  const cards = [];
  configs.forEach((cfg, ci) => {
    if (!cfg.data || cfg.data.length === 0) return;

    const row = cfg.data[0];
    const keys = Object.keys(row);

    if (keys.length === 1 && cfg.display_type === 'number') {
      // 单列 → 查询名称为标签
      cards.push({ label: cfg.name, value: row[keys[0]], theme: KPI_THEMES[cards.length % KPI_THEMES.length] });
    } else if (cfg.display_type === 'number') {
      // 多列 → 每列一个卡片（第一列可能是标签列，跳过非数值列）
      keys.forEach(key => {
        const val = row[key];
        if (typeof val === 'number' || (typeof val === 'string' && !isNaN(val) && val !== '')) {
          cards.push({
            label: colNameToLabel(key),
            value: typeof val === 'string' ? parseFloat(val) : val,
            theme: KPI_THEMES[cards.length % KPI_THEMES.length],
          });
        }
      });
    }
  });

  if (cards.length === 0) {
    // 无有效数据，保留静态占位
    return;
  }

  grid.innerHTML = cards.map(c => {
    const valStr = formatKpiValue(c.value);
    return `
      <div class="kpi-card ${c.theme.cls} dyn-kpi">
        <div class="kpi-icon"><i class="fa-solid ${c.theme.icon}"></i></div>
        <div class="kpi-label">${esc(c.label)}</div>
        <div class="kpi-value" style="color:${c.theme.color};">${valStr}</div>
        <div class="kpi-sub">数据来源: ${esc(configs[0]?.source_name || '动态配置')}</div>
      </div>
    `;
  }).join('');

  // 动画
  cards.forEach((c, i) => {
    const el = grid.querySelectorAll('.kpi-value')[i];
    if (el) animateKPIElement(el, c.value);
  });
}

function renderMockKpiCards(summary) {
  // 恢复静态 HTML 结构
  const grid = document.getElementById('kpiGrid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="kpi-card pre">
      <div class="kpi-icon"><i class="fa-solid fa-vial-circle-check"></i></div>
      <div class="kpi-label">平均实验前 TAT</div>
      <div class="kpi-value" id="kpiPreTAT">—</div>
      <div class="kpi-sub">样本采集 → 实验室接收</div>
    </div>
    <div class="kpi-card intra">
      <div class="kpi-icon"><i class="fa-solid fa-flask"></i></div>
      <div class="kpi-label">平均实验内 TAT</div>
      <div class="kpi-value" id="kpiIntraTAT">—</div>
      <div class="kpi-sub">实验室接收 → 结果报告</div>
    </div>
    <div class="kpi-card pass">
      <div class="kpi-icon"><i class="fa-solid fa-circle-check"></i></div>
      <div class="kpi-label">总达标率</div>
      <div class="kpi-value" id="kpiPassRate">—</div>
      <div class="kpi-sub">所有项目加权平均</div>
    </div>
    <div class="kpi-card total">
      <div class="kpi-icon"><i class="fa-solid fa-database"></i></div>
      <div class="kpi-label">总样本数</div>
      <div class="kpi-value" id="kpiSamples">—</div>
      <div class="kpi-sub">近30天统计</div>
    </div>
  `;

  if (summary) {
    animateKPI('kpiPreTAT', summary.avg_pre_tat, 'min');
    animateKPI('kpiIntraTAT', summary.avg_intra_tat, 'min');
    animateKPI('kpiPassRate', summary.pass_rate, '%');
    animateKPI('kpiSamples', summary.total_samples, '');
  }
}

// ============================================
// 动态图表渲染（自动识别列映射）
// ============================================
function renderDynamicChart(chartType, config) {
  const data = config.data;
  if (!data || data.length === 0) return;

  const columns = config.columns || Object.keys(data[0]);
  const numCols = columns.filter(c => typeof data[0][c] === 'number' || (typeof data[0][c] === 'string' && !isNaN(data[0][c])));

  // 第一列为标签/X轴
  const labelCol = columns[0];
  const labels = data.map(r => String(r[labelCol] || ''));

  if (chartType === 'line') {
    renderDynamicLineChart(labels, columns, numCols, data, config);
  } else if (chartType === 'bar') {
    renderDynamicBarChart(labels, columns, numCols, data, config);
  } else if (chartType === 'doughnut') {
    renderDynamicDoughnutChart(labels, columns, numCols, data, config);
  }
}

function renderDynamicLineChart(labels, columns, numCols, data, config) {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (trendChart) trendChart.destroy();

  const lineColors = ['#818cf8', '#22d3bb', '#fbbf24', '#f472b6', '#34d399'];
  const seriesCols = numCols.slice(0, 5); // 最多5条线
  if (seriesCols.length === 0) seriesCols.push(columns[1] || columns[0]);

  const datasets = seriesCols.map((col, i) => {
    const grad = ctx.createLinearGradient(0, 0, 0, 320);
    grad.addColorStop(0, lineColors[i % lineColors.length].replace(')', ',0.25)').replace('rgb', 'rgba'));
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    return {
      label: colNameToLabel(col),
      data: data.map(r => parseFloat(r[col]) || 0),
      borderColor: lineColors[i % lineColors.length],
      backgroundColor: grad,
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 5,
      pointBackgroundColor: lineColors[i % lineColors.length],
      tension: 0.4,
      fill: true,
    };
  });

  // 更新标题
  const titleEl = document.querySelector('#trendChartCard .chart-title');
  if (titleEl && config.name) titleEl.innerHTML = `<i class="fa-solid fa-chart-line"></i> ${esc(config.name)}`;

  trendChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { color: 'rgba(255,255,255,0.6)', usePointStyle: true, pointStyleWidth: 8, padding: 20, font: { size: 12 } },
        },
        tooltip: {
          backgroundColor: 'rgba(15,20,40,0.95)', titleColor: '#e2e8f0', bodyColor: 'rgba(255,255,255,0.7)',
          borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12, cornerRadius: 8,
        },
      },
      scales: {
        x: { grid: darkGrid, ticks: { ...darkTicks, maxTicksLimit: 10 } },
        y: { grid: darkGrid, ticks: { ...darkTicks, callback: v => v }, title: { display: true, text: colNameToLabel(seriesCols[0] || ''), color: 'rgba(255,255,255,0.4)', font: { size: 11 } } },
      },
    },
  });
}

function renderDynamicBarChart(labels, columns, numCols, data, config) {
  const canvas = document.getElementById('barChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (barChart) barChart.destroy();

  const barColors = ['rgba(129,140,248,0.6)', 'rgba(34,211,187,0.5)', 'rgba(251,191,36,0.5)', 'rgba(244,114,182,0.5)'];
  const barBorders = ['rgba(129,140,248,0.9)', 'rgba(34,211,187,0.8)', 'rgba(251,191,36,0.8)', 'rgba(244,114,182,0.8)'];
  const seriesCols = numCols.slice(0, 4);
  if (seriesCols.length === 0) seriesCols.push(columns[1] || columns[0]);

  const titleEl = document.querySelector('#barChartCard .chart-title');
  if (titleEl && config.name) titleEl.innerHTML = `<i class="fa-solid fa-chart-bar"></i> ${esc(config.name)}`;

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: seriesCols.map((col, i) => ({
        label: colNameToLabel(col),
        data: data.map(r => parseFloat(r[col]) || 0),
        backgroundColor: barColors[i % barColors.length],
        borderColor: barBorders[i % barBorders.length],
        borderWidth: 1, borderRadius: 4, borderSkipped: false,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { color: 'rgba(255,255,255,0.6)', usePointStyle: true, pointStyleWidth: 8, padding: 20, font: { size: 12 } },
        },
        tooltip: {
          backgroundColor: 'rgba(15,20,40,0.95)', titleColor: '#e2e8f0', bodyColor: 'rgba(255,255,255,0.7)',
          borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12, cornerRadius: 8,
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { ...darkTicks, font: { size: 12 } } },
        y: { grid: darkGrid, ticks: { ...darkTicks }, title: { display: true, text: colNameToLabel(seriesCols[0] || ''), color: 'rgba(255,255,255,0.4)', font: { size: 11 } } },
      },
    },
  });
}

function renderDynamicDoughnutChart(labels, columns, numCols, data, config) {
  const canvas = document.getElementById('doughnutChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (doughnutChart) doughnutChart.destroy();

  const valueCol = numCols.length > 0 ? numCols[0] : (columns[1] || columns[0]);
  const values = data.map(r => parseFloat(r[valueCol]) || 0);

  const doughColors = [
    'rgba(74,222,128,0.7)', 'rgba(52,211,153,0.7)', 'rgba(251,191,36,0.7)',
    'rgba(129,140,248,0.7)', 'rgba(244,114,182,0.7)', 'rgba(248,113,113,0.7)',
    'rgba(34,211,187,0.7)', 'rgba(251,146,60,0.7)',
  ];
  const doughBorders = doughColors.map(c => c.replace('0.7', '0.3'));

  const total = values.reduce((s, v) => s + v, 0);
  const avg = values.length > 0 ? Math.round(total / values.length) : 0;
  document.getElementById('doughnutCenterVal').textContent = avg;

  const titleEl = document.querySelector('#doughnutChartCard .chart-title');
  if (titleEl && config.name) titleEl.innerHTML = `<i class="fa-solid fa-chart-pie"></i> ${esc(config.name)}`;

  doughnutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: doughColors.slice(0, labels.length),
        borderColor: doughBorders.slice(0, labels.length),
        borderWidth: 2,
        hoverBorderColor: doughColors.slice(0, labels.length).map(c => c.replace('0.7', '0.9')),
        cutout: '70%',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: 'rgba(255,255,255,0.6)', usePointStyle: true, pointStyleWidth: 8, padding: 16, font: { size: 11 } },
        },
        tooltip: {
          backgroundColor: 'rgba(15,20,40,0.95)', titleColor: '#e2e8f0', bodyColor: 'rgba(255,255,255,0.7)',
          borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12, cornerRadius: 8,
          callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}` },
        },
      },
    },
  });
}

// ============================================
// 动态表格渲染
// ============================================
function renderDynamicTable(config) {
  const data = config.data;
  if (!data || data.length === 0) return;

  const columns = config.columns || Object.keys(data[0]);
  const thead = document.getElementById('detailTableHead');
  const tbody = document.getElementById('detailTableBody');
  const titleEl = document.querySelector('#detailTableWrap .chart-title');
  if (titleEl && config.name) titleEl.innerHTML = `<i class="fa-solid fa-table-list"></i> ${esc(config.name)}`;

  // 更新表头
  thead.innerHTML = `<tr>${columns.map(c => `<th>${colNameToLabel(c)}</th>`).join('')}</tr>`;

  // 更新表体
  tbody.innerHTML = data.slice(0, 200).map(row => `
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

  if (data.length > 200) {
    tbody.innerHTML += `<tr><td colspan="${columns.length}" style="text-align:center;padding:12px;color:rgba(255,255,255,0.3);">数据已截断，仅显示前 200 行（共 ${data.length} 行）</td></tr>`;
  }
}

// ============================================
// KPI 动画（通用）
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
    const current = isDecimal
      ? (target * val).toFixed(1)
      : Math.round(target * val);

    if (unit === '%') {
      el.innerHTML = current + '<span class="kpi-unit">%</span>';
    } else if (unit === 'min') {
      el.innerHTML = current + '<span class="kpi-unit"> min</span>';
    } else {
      el.innerHTML = (typeof current === 'number' ? current.toLocaleString() : current);
    }

    if (progress < 1) {
      requestAnimationFrame(step);
    }
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
// 列名 → 中文友好标签
// ============================================
function colNameToLabel(col) {
  const map = {
    avg_pre_tat: '实验前 TAT', intra_tat: '实验内 TAT', pre_tat: '实验前 TAT',
    avg_intra_tat: '实验内 TAT', pass_rate: '达标率', total_samples: '样本数',
    name: '名称', code: '编码', date: '日期', samples: '样本数',
    pre_target: '实验前目标', intra_target: '实验内目标', total_actual: '实际总TAT',
    total_target: '目标总TAT', item_name: '项目名称', count: '数量',
    value: '数值', label: '标签', category: '分类',
  };
  return map[col] || col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ============================================
// 深色主题 Chart.js 配置
// ============================================
const darkGrid = { color: 'rgba(255,255,255,0.06)' };
const darkTicks = { color: 'rgba(255,255,255,0.4)', font: { size: 11 } };

// ============================================
// Mock 数据折线图（兜底用）
// ============================================
function renderTrendChart(trend) {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (trendChart) trendChart.destroy();

  const labels = trend.map(t => t.date.slice(5));
  const preData = trend.map(t => t.avg_pre_tat);
  const intraData = trend.map(t => t.avg_intra_tat);

  const gradPre = ctx.createLinearGradient(0, 0, 0, 320);
  gradPre.addColorStop(0, 'rgba(129, 140, 248, 0.25)');
  gradPre.addColorStop(1, 'rgba(129, 140, 248, 0.0)');
  const gradIntra = ctx.createLinearGradient(0, 0, 0, 320);
  gradIntra.addColorStop(0, 'rgba(34, 211, 187, 0.20)');
  gradIntra.addColorStop(1, 'rgba(34, 211, 187, 0.0)');

  trendChart = new Chart(ctx, {
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
}

// ============================================
// Mock 环形图（兜底用）
// ============================================
function renderDoughnutChart(items, avgPassRate) {
  const canvas = document.getElementById('doughnutChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (doughnutChart) doughnutChart.destroy();

  const good = items.filter(i => i.pass_rate >= 95).length;
  const warn = items.filter(i => i.pass_rate >= 85 && i.pass_rate < 95).length;
  const bad = items.filter(i => i.pass_rate < 85).length;

  document.getElementById('doughnutCenterVal').textContent = avgPassRate + '%';

  doughnutChart = new Chart(ctx, {
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
}

// ============================================
// Mock 柱状图（兜底用）
// ============================================
function renderBarChart(items) {
  const canvas = document.getElementById('barChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (barChart) barChart.destroy();

  barChart = new Chart(ctx, {
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
}

// ============================================
// Mock 数据明细表（兜底用）
// ============================================
function renderDetailTable(items) {
  const tbody = document.getElementById('detailTableBody');
  const thead = document.getElementById('detailTableHead');
  thead.innerHTML = `
    <tr>
      <th>检验项目</th><th>实验前 TAT</th><th>实验内 TAT</th>
      <th>总 TAT</th><th>目标 TAT</th><th>样本数</th><th>达标率</th><th>状态</th>
    </tr>`;

  tbody.innerHTML = items.map(item => {
    let statusClass, statusText;
    if (item.pass_rate >= 95) { statusClass = 'good'; statusText = '达标'; }
    else if (item.pass_rate >= 85) { statusClass = 'warn'; statusText = '警告'; }
    else { statusClass = 'bad'; statusText = '超时'; }

    const barClass = item.pass_rate >= 95 ? 'good' : (item.pass_rate >= 85 ? 'warn' : 'bad');
    const barWidth = Math.min(100, item.pass_rate);

    return `
      <tr>
        <td>
          <span class="item-name">${esc(item.name)}</span>
          <span class="item-code">${item.code}</span>
        </td>
        <td><span class="tat-val pre-color">${item.pre_tat} min</span><span style="color:rgba(255,255,255,0.3);font-size:11px;"> / 目标 ${item.pre_target} min</span></td>
        <td><span class="tat-val intra-color">${item.intra_tat} min</span><span style="color:rgba(255,255,255,0.3);font-size:11px;"> / 目标 ${item.intra_target} min</span></td>
        <td style="font-weight:600;color:#e2e8f0;">${item.total_actual} min</td>
        <td style="color:rgba(255,255,255,0.4);">${item.total_target} min</td>
        <td style="color:rgba(255,255,255,0.5);">${item.samples}</td>
        <td><span style="color:#e2e8f0;font-weight:600;">${item.pass_rate}%</span><span class="mini-bar"><span class="fill ${barClass}" style="width:${barWidth}%;"></span></span></td>
        <td><span class="badge-pass ${statusClass}">${statusText}</span></td>
      </tr>
    `;
  }).join('');
}

// 供小组切换后刷新
window.refreshPageData = async function () {
  await loadTATDashboard();
};

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
