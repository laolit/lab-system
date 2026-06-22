/* ========================================
   仪表盘逻辑 — 重新设计版
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;

  renderUserInfo();
  document.getElementById('sidebarUserName').textContent =
    ((getUser() || {}).display_name || (getUser() || {}).username || '—');

  // 欢迎横幅
  renderWelcomeBanner();

  // 加载统计数据
  loadSummary();
});

// ============================================
// 欢迎横幅
// ============================================
function renderWelcomeBanner() {
  const user = getUser();
  const displayName = (user || {}).display_name || (user || {}).username || '管理员';
  const groupName = (getGroup() || {}).name || '—';
  const now = new Date();
  const hour = now.getHours();

  let greeting;
  if (hour < 6) greeting = '🌙 夜深了';
  else if (hour < 9) greeting = '🌅 早上好';
  else if (hour < 12) greeting = '☀️ 上午好';
  else if (hour < 14) greeting = '👋 中午好';
  else if (hour < 18) greeting = '☕ 下午好';
  else greeting = '🌆 晚上好';

  const dateStr = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });

  document.getElementById('welcomeGreeting').textContent = greeting;
  document.getElementById('welcomeName').textContent = displayName;
  document.getElementById('welcomeGroupName').textContent = groupName;
  document.getElementById('welcomeDate').textContent = dateStr;
}

// ============================================
// 统计条数据加载
// ============================================
async function loadSummary() {
  try {
    const resp = await http.get('/dashboard/summary');
    if (resp && resp.code === 200) {
      const d = resp.data;
      document.getElementById('statPersonnel').textContent = d.personnel_count || 0;
      document.getElementById('statEquipment').textContent = d.equipment_count || 0;
      document.getElementById('statConsumables').textContent = d.consumables_count || 0;
      document.getElementById('statDocuments').textContent = d.documents_count || 0;
      document.getElementById('statEnvironment').textContent = d.environment_records || 0;
      document.getElementById('statRisk').textContent = d.risk_items || 0;
    }
  } catch (err) {
    console.error('加载仪表盘数据失败:', err);
  }
}

// 供小组切换后刷新
window.refreshPageData = async function () {
  renderWelcomeBanner();
  await loadSummary();
};
