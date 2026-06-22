/* ========================================
   公共 JS — HTTP 封装、鉴权、导航、UI 辅助
   ======================================== */

const API_BASE = '/api';

// ---------- Token 管理 ----------
function getToken() {
  return localStorage.getItem('token');
}
function setToken(token) {
  localStorage.setItem('token', token);
}
function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('group');
}

// ---------- 用户信息 ----------
function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch { return null; }
}
function setUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

// ---------- 当前小组 ----------
function getGroup() {
  try {
    return JSON.parse(localStorage.getItem('group'));
  } catch { return null; }
}
function setGroup(group) {
  localStorage.setItem('group', JSON.stringify(group));
}

// ---------- HTTP 请求封装 ----------
async function request(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const resp = await fetch(API_BASE + url, { ...options, headers });

  if (resp.status === 401) {
    clearToken();
    window.location.href = '/login.html';
    return null;
  }

  return resp.json();
}

const http = {
  get: (url) => request(url),
  post: (url, data) => request(url, { method: 'POST', body: JSON.stringify(data) }),
  put: (url, data) => request(url, { method: 'PUT', body: JSON.stringify(data) }),
  del: (url) => request(url, { method: 'DELETE' }),
};

// ---------- Toast 提示 ----------
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3000);
}

// ---------- 模态框 ----------
function showModal(title, contentHtml, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${title}</h3>
      <div class="modal-body">${contentHtml}</div>
      <div class="modal-actions">
        <button class="btn btn-outline modal-cancel">取消</button>
        <button class="btn btn-primary modal-confirm">确认</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.modal-cancel').onclick = () => overlay.remove();
  overlay.querySelector('.modal-confirm').onclick = () => {
    onConfirm(overlay);
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ---------- 登出 ----------
async function logout() {
  await http.post('/auth/logout');
  clearToken();
  window.location.href = '/login.html';
}

// ---------- 初始化：检查登录状态 ----------
function checkAuth() {
  if (!getToken()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

// ---------- 小组切换 ----------
async function switchGroup(groupId) {
  try {
    const resp = await http.post('/auth/switch-group', { group_id: parseInt(groupId, 10) });
    if (resp && resp.code === 200) {
      setToken(resp.data.token);
      setGroup(resp.data.group);
      renderUserInfo();
      // 调用页面自定义刷新钩子
      if (typeof window.refreshPageData === 'function') {
        await window.refreshPageData();
      }
    } else {
      showToast((resp || {}).message || '小组切换失败', 'error');
    }
  } catch (err) {
    console.error('切换小组失败:', err);
    showToast('小组切换失败', 'error');
  }
}

async function loadGroupSwitcher() {
  const selectEl = document.getElementById('groupSwitcher');
  if (!selectEl) return;

  try {
    const resp = await http.get('/auth/my-groups');
    if (!resp || resp.code !== 200 || !resp.data.length) {
      selectEl.innerHTML = '<option value="">无可用小组</option>';
      return;
    }

    const currentGroup = getGroup();
    selectEl.innerHTML = resp.data.map(g =>
      `<option value="${g.id}" ${currentGroup && currentGroup.id === g.id ? 'selected' : ''}>${escHtml(g.name)}</option>`
    ).join('');

    // 移除旧监听器后重新绑定（避免重复绑定）
    if (selectEl._switchHandler) {
      selectEl.removeEventListener('change', selectEl._switchHandler);
    }
    selectEl._switchHandler = function () {
      if (this.value && (!currentGroup || parseInt(this.value, 10) !== currentGroup.id)) {
        switchGroup(this.value);
      }
    };
    selectEl.addEventListener('change', selectEl._switchHandler);
  } catch (err) {
    console.error('加载小组切换器失败:', err);
  }
}

// ---------- 渲染用户信息 ----------
function renderUserInfo() {
  const user = getUser();
  const group = getGroup();
  if (!user) return;
  const el = document.getElementById('userDisplayName');
  const avatar = document.getElementById('userAvatar');
  const groupEl = document.getElementById('currentGroupName');
  const sidebarGroupEl = document.getElementById('sidebarGroupName');
  if (el) el.textContent = user.display_name || user.username;
  if (avatar) avatar.textContent = (user.display_name || user.username).charAt(0).toUpperCase();
  if (groupEl && group) groupEl.textContent = group.name;
  if (sidebarGroupEl && group) sidebarGroupEl.textContent = '当前小组: ' + group.name;
  // 自动填充小组切换器
  loadGroupSwitcher();
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- 侧边栏角色过滤：仅 admin 可见"系统管理" ----------
function filterSidebarByRole() {
  const user = getUser();
  if (user && user.role === 'admin') return;

  const sections = document.querySelectorAll('.sidebar-nav .nav-section');
  for (const section of sections) {
    if (section.textContent.trim() === '系统管理') {
      section.style.display = 'none';
      let next = section.nextElementSibling;
      while (next && !next.classList.contains('nav-section')) {
        if (next.tagName === 'A') next.style.display = 'none';
        next = next.nextElementSibling;
      }
      break;
    }
  }
}

document.addEventListener('DOMContentLoaded', filterSidebarByRole);
