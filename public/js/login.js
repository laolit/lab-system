/* ========================================
   登录页逻辑
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {
  // 如果已登录，直接跳转
  if (getToken()) {
    window.location.href = '/index.html';
    return;
  }

  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  const groupSelect = document.getElementById('groupSelect');

  // 页面加载时获取小组列表
  loadGroups();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const group_id = groupSelect.value;

    if (!username || !password) {
      showError('请输入用户名和密码');
      return;
    }
    if (!group_id) {
      showError('请选择所属小组');
      return;
    }

    // Loading 状态
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 登录中...';
    errorEl.classList.remove('show');

    try {
      const resp = await http.post('/auth/login', { username, password, group_id });

      if (resp && resp.code === 200) {
        setToken(resp.data.token);
        setUser(resp.data.user);
        setGroup(resp.data.group);
        window.location.href = '/index.html';
      } else if (resp) {
        showError(resp.message || '登录失败');
      } else {
        showError('网络错误，请检查服务器连接');
      }
    } catch (err) {
      showError('网络错误，请检查服务器连接');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> 登 录';
    }
  });

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('show');
    setTimeout(() => errorEl.classList.remove('show'), 4000);
  }

  async function loadGroups() {
    try {
      const resp = await fetch('/api/auth/groups');
      const data = await resp.json();
      if (data && data.code === 200 && data.data.length > 0) {
        groupSelect.innerHTML = '<option value="">请选择所属小组</option>' +
          data.data.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
      } else {
        groupSelect.innerHTML = '<option value="">暂无可用小组</option>';
      }
    } catch (err) {
      groupSelect.innerHTML = '<option value="">加载失败，请刷新重试</option>';
    }
  }
});
