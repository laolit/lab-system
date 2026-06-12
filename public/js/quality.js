/* ========================================
   TAT 质量监控 — 图表 & 交互逻辑
   ======================================== */

let trendChart = null;
let doughnutChart = null;
let barChart = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  renderUserInfo();
  document.getElementById('sidebarUserName').textContent =
    (getUser()?.display_name || getUser()?.username || '—');

  loadTATDashboard();
});

// ============================================
// 加载数据
// ============================================
async function loadTATDashboard() {
  try {
    const resp = await http.get('/quality/tat-dashboard');
    if (!resp || resp.code !== 200) {
      showToast('TAT 数据加载失败', 'error');
      return;
    }

    const { summary, items, trend } = resp.data;

    // KPI 卡片动画
    animateKPI('kpiPreTAT', summary.avg_pre_tat, 'min');
    animateKPI('kpiIntraTAT', summary.avg_intra_tat, 'min');
    animateKPI('kpiPassRate', summary.pass_rate, '%');
    animateKPI('kpiSamples', summary.total_samples, '');

    // 图表
    renderTrendChart(trend);
    renderDoughnutChart(items, summary.pass_rate);
    renderBarChart(items);
    renderDetailTable(items);

  } catch (err) {
    console.error('加载 TAT 数据失败:', err);
    showToast('TAT 数据加载失败', 'error');
  }
}

// ============================================
// KPI 数字动画
// ============================================
function animateKPI(elId, target, unit) {
  const el = document.getElementById(elId);
  if (!el) return;

  const isDecimal = target % 1 !== 0;
  const duration = 800;
  const start = performance.now();

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // ease-out
    const val = 1 - Math.pow(1 - progress, 3);
    const current = isDecimal
      ? (target * val).toFixed(1)
      : Math.round(target * val);

    if (unit === '%') {
      el.innerHTML = current + '<span class="kpi-unit">%</span>';
    } else if (unit === 'min') {
      el.innerHTML = current + '<span class="kpi-unit"> min</span>';
    } else {
      el.innerHTML = current.toLocaleString();
    }

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

// ============================================
// Chart.js 深色主题默认配置
// ============================================
const darkGrid = {
  color: 'rgba(255,255,255,0.06)',
};
const darkTicks = {
  color: 'rgba(255,255,255,0.4)',
  font: { size: 11 },
};

// ============================================
// 折线图 — 近30天 TAT 趋势
// ============================================
function renderTrendChart(trend) {
  const ctx = document.getElementById('trendChart').getContext('2d');

  if (trendChart) trendChart.destroy();

  const labels = trend.map(t => t.date.slice(5)); // MM-DD
  const preData = trend.map(t => t.avg_pre_tat);
  const intraData = trend.map(t => t.avg_intra_tat);

  // 渐变填充
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
        {
          label: '实验前 TAT',
          data: preData,
          borderColor: '#818cf8',
          backgroundColor: gradPre,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: '#818cf8',
          tension: 0.4,
          fill: true,
        },
        {
          label: '实验内 TAT',
          data: intraData,
          borderColor: '#22d3bb',
          backgroundColor: gradIntra,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: '#22d3bb',
          tension: 0.4,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            color: 'rgba(255,255,255,0.6)',
            usePointStyle: true,
            pointStyleWidth: 8,
            padding: 20,
            font: { size: 12 },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15,20,40,0.95)',
          titleColor: '#e2e8f0',
          bodyColor: 'rgba(255,255,255,0.7)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: darkGrid,
          ticks: { ...darkTicks, maxTicksLimit: 10 },
        },
        y: {
          grid: darkGrid,
          ticks: { ...darkTicks, callback: v => v + ' min' },
          title: {
            display: true,
            text: '周转时间 (分钟)',
            color: 'rgba(255,255,255,0.4)',
            font: { size: 11 },
          },
        },
      },
    },
  });
}

// ============================================
// 环形图 — 项目达标率分布
// ============================================
function renderDoughnutChart(items, avgPassRate) {
  const ctx = document.getElementById('doughnutChart').getContext('2d');

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
        backgroundColor: [
          'rgba(74, 222, 128, 0.7)',
          'rgba(251, 191, 36, 0.7)',
          'rgba(248, 113, 113, 0.7)',
        ],
        borderColor: [
          'rgba(74, 222, 128, 0.3)',
          'rgba(251, 191, 36, 0.3)',
          'rgba(248, 113, 113, 0.3)',
        ],
        borderWidth: 2,
        hoverBorderColor: [
          'rgba(74, 222, 128, 0.8)',
          'rgba(251, 191, 36, 0.8)',
          'rgba(248, 113, 113, 0.8)',
        ],
        cutout: '70%',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: 'rgba(255,255,255,0.6)',
            usePointStyle: true,
            pointStyleWidth: 8,
            padding: 16,
            font: { size: 11 },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15,20,40,0.95)',
          titleColor: '#e2e8f0',
          bodyColor: 'rgba(255,255,255,0.7)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: ctx => `${ctx.label}: ${ctx.raw} 项`,
          },
        },
      },
    },
  });
}

// ============================================
// 分组柱状图 — 各项目 TAT 对比
// ============================================
function renderBarChart(items) {
  const ctx = document.getElementById('barChart').getContext('2d');

  if (barChart) barChart.destroy();

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: items.map(i => i.name),
      datasets: [
        {
          label: '实验前 TAT',
          data: items.map(i => i.pre_tat),
          backgroundColor: 'rgba(129, 140, 248, 0.6)',
          borderColor: 'rgba(129, 140, 248, 0.9)',
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: '实验内 TAT',
          data: items.map(i => i.intra_tat),
          backgroundColor: 'rgba(34, 211, 187, 0.5)',
          borderColor: 'rgba(34, 211, 187, 0.8)',
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            color: 'rgba(255,255,255,0.6)',
            usePointStyle: true,
            pointStyleWidth: 8,
            padding: 20,
            font: { size: 12 },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15,20,40,0.95)',
          titleColor: '#e2e8f0',
          bodyColor: 'rgba(255,255,255,0.7)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.raw} min`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { ...darkTicks, font: { size: 12 } },
        },
        y: {
          grid: darkGrid,
          ticks: { ...darkTicks, callback: v => v + ' min' },
          title: {
            display: true,
            text: '周转时间 (分钟)',
            color: 'rgba(255,255,255,0.4)',
            font: { size: 11 },
          },
        },
      },
    },
  });
}

// ============================================
// 数据明细表
// ============================================
function renderDetailTable(items) {
  const tbody = document.getElementById('detailTableBody');

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
        <td>
          <span class="tat-val pre-color">${item.pre_tat} min</span>
          <span style="color:rgba(255,255,255,0.3);font-size:11px;"> / 目标 ${item.pre_target} min</span>
        </td>
        <td>
          <span class="tat-val intra-color">${item.intra_tat} min</span>
          <span style="color:rgba(255,255,255,0.3);font-size:11px;"> / 目标 ${item.intra_target} min</span>
        </td>
        <td style="font-weight:600;color:#e2e8f0;">${item.total_actual} min</td>
        <td style="color:rgba(255,255,255,0.4);">${item.total_target} min</td>
        <td style="color:rgba(255,255,255,0.5);">${item.samples}</td>
        <td>
          <span style="color:#e2e8f0;font-weight:600;">${item.pass_rate}%</span>
          <span class="mini-bar"><span class="fill ${barClass}" style="width:${barWidth}%;"></span></span>
        </td>
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
