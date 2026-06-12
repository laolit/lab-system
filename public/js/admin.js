/* ========================================
   用户管理 + 小组管理 CRUD
   ======================================== */

let allGroupsCache = []; // 全局小组缓存

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  renderUserInfo();
  document.getElementById('sidebarUserName').textContent =
    (getUser()?.display_name || getUser()?.username || '—');

  // 检查权限
  if (getUser()?.role !== 'admin') {
    document.querySelector('.page-content').innerHTML = `
      <div class="empty-state"><i class="fa-solid fa-lock"></i><p>权限不足，仅系统管理员可访问</p></div>`;
    return;
  }

  // 加载小组缓存，然后加载用户
  loadGroupsCache().then(() => loadUsers());

  // Tab 切换
  document.querySelectorAll('#adminTabs .tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#adminTabs .tab-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'groups') loadGroups();
    });
  });
});

// ============================================
// 小组缓存
// ============================================
async function loadGroupsCache() {
  try {
    const resp = await http.get('/admin/groups');
    if (resp && resp.code === 200) allGroupsCache = resp.data || [];
  } catch (e) { console.error('加载小组缓存失败:', e); }
}

// ============================================
// 用户管理
// ============================================

async function loadUsers() {
  const tbody = document.getElementById('userTableBody');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#9ca3af;">加载中...</td></tr>';

  try {
    const resp = await http.get('/admin/users');
    if (!resp || resp.code !== 200) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
      return;
    }

    const users = resp.data || [];
    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#9ca3af;">暂无用户数据</td></tr>';
      return;
    }

    const roleMap = { admin: '系统管理员', manager: '管理员', operator: '操作员', viewer: '仅查看' };
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${u.id}</td>
        <td>${esc(u.username)}</td>
        <td>${esc(u.display_name || '—')}</td>
        <td>${roleMap[u.role] || u.role}</td>
        <td>${(u.groups || []).map(g => `<span style="display:inline-block;background:var(--primary-light);color:var(--primary);padding:1px 8px;border-radius:10px;font-size:12px;margin:1px;">${esc(g.name)}</span>`).join(' ') || '<span style="color:#9ca3af;">—</span>'}</td>
        <td>${u.status === 'active'
          ? '<span style="color:#16a34a;">● 正常</span>'
          : '<span style="color:#dc2626;">● 禁用</span>'}</td>
        <td>${u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '—'}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openUserDialog(${u.id})"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-outline btn-sm" onclick="resetPassword(${u.id})"><i class="fa-solid fa-key"></i></button>
          <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id}, '${esc(u.username)}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('加载用户列表失败:', err);
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
  }
}

function openUserDialog(id) {
  if (id) {
    // 编辑
    document.getElementById('userModalTitle').textContent = '编辑用户';
    document.getElementById('editUserId').value = id;
    document.getElementById('editUsername').disabled = true;
    document.getElementById('pwdGroup').style.display = 'none';
  } else {
    // 新增
    document.getElementById('userModalTitle').textContent = '新增用户';
    document.getElementById('editUserId').value = '';
    document.getElementById('editUsername').value = '';
    document.getElementById('editUsername').disabled = false;
    document.getElementById('editPassword').value = '';
    document.getElementById('pwdGroup').style.display = '';
    document.getElementById('editDisplayName').value = '';
    document.getElementById('editRole').value = 'viewer';
  }

  // 渲染小组复选框
  let groupHtml = '';
  if (allGroupsCache.length === 0) {
    groupHtml = '<span style="color:#9ca3af;font-size:13px;">暂无小组数据</span>';
  } else {
    groupHtml = allGroupsCache.map(g => `
      <label style="display:inline-block;margin-right:16px;margin-bottom:4px;font-size:13px;cursor:pointer;">
        <input type="checkbox" value="${g.id}" class="group-checkbox"> ${esc(g.name)}
      </label>
    `).join('');
  }
  document.getElementById('editGroups').innerHTML = groupHtml;

  // 编辑时回填数据
  if (id) {
    http.get('/admin/users').then(resp => {
      if (!resp || resp.code !== 200) return;
      const user = resp.data.find(u => u.id == id);
      if (!user) return;
      document.getElementById('editUsername').value = user.username;
      document.getElementById('editDisplayName').value = user.display_name || '';
      document.getElementById('editRole').value = user.role;
      // 勾选所属小组
      const userGroupIds = (user.groups || []).map(g => g.id);
      document.querySelectorAll('.group-checkbox').forEach(cb => {
        cb.checked = userGroupIds.includes(parseInt(cb.value));
      });
    });
  } else {
    // 新增时清空勾选
    document.querySelectorAll('.group-checkbox').forEach(cb => cb.checked = false);
  }

  document.getElementById('userModal').style.display = 'flex';
}

function closeUserModal() {
  document.getElementById('userModal').style.display = 'none';
}

async function saveUser() {
  const id = document.getElementById('editUserId').value;
  const username = document.getElementById('editUsername').value.trim();
  const password = document.getElementById('editPassword').value;
  const display_name = document.getElementById('editDisplayName').value.trim();
  const role = document.getElementById('editRole').value;
  const group_ids = Array.from(document.querySelectorAll('.group-checkbox:checked')).map(cb => parseInt(cb.value));

  if (id) {
    // 编辑
    const resp = await http.put(`/admin/users/${id}`, { display_name, role, status: 'active', group_ids });
    if (resp && resp.code === 200) {
      showToast('用户更新成功');
      closeUserModal();
      loadUsers();
    } else {
      showToast(resp?.message || '更新失败', 'error');
    }
  } else {
    // 新增
    if (!username || !password) { showToast('用户名和密码不能为空', 'error'); return; }
    if (group_ids.length === 0) { showToast('请至少选择一个小组', 'warning'); return; }
    const resp = await http.post('/admin/users', { username, password, display_name, role, group_ids });
    if (resp && resp.code === 200) {
      showToast('用户创建成功');
      closeUserModal();
      loadUsers();
    } else {
      showToast(resp?.message || '创建失败', 'error');
    }
  }
}

async function deleteUser(id, username) {
  showModal('确认删除', `<p>确定要删除用户 <strong>${esc(username)}</strong> 吗？此操作不可恢复。</p>`, async (overlay) => {
    const resp = await http.del(`/admin/users/${id}`);
    if (resp && resp.code === 200) {
      showToast('用户已删除');
      overlay.remove();
      loadUsers();
    } else {
      showToast(resp?.message || '删除失败', 'error');
    }
  });
}

async function resetPassword(id) {
  const contentHtml = `
    <div class="form-group">
      <label>新密码</label>
      <input type="password" id="newPassword" class="form-control" placeholder="请输入新密码">
    </div>`;
  showModal('重置密码', contentHtml, async (overlay) => {
    const pwd = overlay.querySelector('#newPassword').value;
    if (!pwd) { showToast('密码不能为空', 'error'); return; }
    const resp = await http.put(`/admin/users/${id}/password`, { password: pwd });
    if (resp && resp.code === 200) {
      showToast('密码重置成功');
      overlay.remove();
    } else {
      showToast(resp?.message || '密码重置失败', 'error');
    }
  });
}

// ============================================
// 小组管理
// ============================================

async function loadGroups() {
  const tbody = document.getElementById('groupTableBody');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#9ca3af;">加载中...</td></tr>';

  try {
    const resp = await http.get('/admin/groups');
    if (!resp || resp.code !== 200) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
      return;
    }

    const groups = resp.data || [];
    if (groups.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#9ca3af;">暂无小组数据</td></tr>';
      return;
    }

    tbody.innerHTML = groups.map(g => `
      <tr>
        <td>${g.id}</td>
        <td><code>${esc(g.code)}</code></td>
        <td>${esc(g.name)}</td>
        <td>${esc(g.description || '—')}</td>
        <td>${g.status === 'active'
          ? '<span style="color:#16a34a;">● 启用</span>'
          : '<span style="color:#dc2626;">● 停用</span>'}</td>
        <td>${g.created_at ? new Date(g.created_at).toLocaleDateString('zh-CN') : '—'}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openGroupDialog(${g.id})"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-sm" onclick="deleteGroup(${g.id}, '${esc(g.name)}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('加载小组列表失败:', err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
  }
}

function openGroupDialog(id) {
  if (id) {
    // 编辑
    document.getElementById('groupModalTitle').textContent = '编辑小组';
    document.getElementById('editGroupId').value = id;
    const g = allGroupsCache.find(gr => gr.id == id);
    if (g) {
      document.getElementById('editGroupCode').value = g.code;
      document.getElementById('editGroupCode').disabled = true;
      document.getElementById('editGroupName').value = g.name;
      document.getElementById('editGroupDesc').value = g.description || '';
    }
  } else {
    // 新增
    document.getElementById('groupModalTitle').textContent = '新增小组';
    document.getElementById('editGroupId').value = '';
    document.getElementById('editGroupCode').value = '';
    document.getElementById('editGroupCode').disabled = false;
    document.getElementById('editGroupName').value = '';
    document.getElementById('editGroupDesc').value = '';
  }
  document.getElementById('groupModal').style.display = 'flex';
}

function closeGroupModal() {
  document.getElementById('groupModal').style.display = 'none';
}

async function saveGroup() {
  const id = document.getElementById('editGroupId').value;
  const code = document.getElementById('editGroupCode').value.trim();
  const name = document.getElementById('editGroupName').value.trim();
  const description = document.getElementById('editGroupDesc').value.trim();

  if (!name || !code) { showToast('名称和编码不能为空', 'error'); return; }

  if (id) {
    // 编辑
    const resp = await http.put(`/admin/groups/${id}`, { name, description, status: 'active' });
    if (resp && resp.code === 200) {
      showToast('小组更新成功');
      closeGroupModal();
      await loadGroupsCache();
      loadGroups();
    } else {
      showToast(resp?.message || '更新失败', 'error');
    }
  } else {
    // 新增
    const resp = await http.post('/admin/groups', { name, code, description });
    if (resp && resp.code === 200) {
      showToast('小组创建成功');
      closeGroupModal();
      await loadGroupsCache();
      loadGroups();
    } else {
      showToast(resp?.message || '创建失败', 'error');
    }
  }
}

async function deleteGroup(id, name) {
  showModal('确认删除', `<p>确定要删除小组 <strong>${esc(name)}</strong> 吗？关联的用户小组关系也将被清除。</p>`, async (overlay) => {
    const resp = await http.del(`/admin/groups/${id}`);
    if (resp && resp.code === 200) {
      showToast('小组已删除');
      overlay.remove();
      await loadGroupsCache();
      loadGroups();
    } else {
      showToast(resp?.message || '删除失败', 'error');
    }
  });
}

// 点击遮罩关闭
document.addEventListener('click', (e) => {
  if (e.target.id === 'userModal') closeUserModal();
  if (e.target.id === 'groupModal') closeGroupModal();
});

// 供小组切换后刷新
window.refreshPageData = async function () {
  await loadUsers();
};

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
