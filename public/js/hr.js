/* ========================================
   人力资源与能力资质 — 人员信息 CRUD
   ======================================== */

let allGroups = [];
let currentPhotoBase64 = '';

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  renderUserInfo();
  document.getElementById('sidebarUserName').textContent =
    ((getUser() || {}).display_name || (getUser() || {}).username || '—');

  loadPersonnelList('', '', '');

  // Tab 切换 — 对齐 equipment.js 模式
  document.querySelectorAll('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'personnel') {
        loadPersonnelList(
          (document.getElementById('searchInput') || {}).value || '',
          (document.getElementById('dateFrom') || {}).value || '',
          (document.getElementById('dateTo') || {}).value || ''
        );
      }
    });
  });

  // 搜索框回车
  document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  // 日期输入框回车
  document.getElementById('dateFrom').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
  document.getElementById('dateTo').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  // 遮罩点击关闭
  document.addEventListener('click', (e) => {
    if (e.target.id === 'personnelModal') closePersonnelDialog();
  });
});

// ============================================
// 加载人员列表
// ============================================
async function loadPersonnelList(searchTerm, dateFrom, dateTo) {
  const tbody = document.getElementById('personnelTableBody');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#9ca3af;">加载中...</td></tr>';

  try {
    // 确保小组列表已加载
    if (allGroups.length === 0) {
      await loadGroupOptions();
    }

    const term = searchTerm !== undefined ? searchTerm : ((document.getElementById('searchInput') || {}).value || '');
    const dFrom = dateFrom !== undefined ? dateFrom : ((document.getElementById('dateFrom') || {}).value || '');
    const dTo = dateTo !== undefined ? dateTo : ((document.getElementById('dateTo') || {}).value || '');

    const params = new URLSearchParams();
    if (term) params.set('search', term);
    if (dFrom) params.set('date_from', dFrom);
    if (dTo) params.set('date_to', dTo);
    const qs = params.toString();
    const url = '/hr/personnel' + (qs ? '?' + qs : '');

    const resp = await http.get(url);
    if (!resp || resp.code !== 200) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#ef4444;">数据加载失败</td></tr>';
      return;
    }

    const data = resp.data || [];
    if (data.length === 0) {
      const msg = term || dateFrom || dateTo
        ? '未找到匹配的人员记录'
        : '暂无人员数据，点击「新增人员」添加';
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:#9ca3af;">${esc(msg)}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(item => {
      const groupName = (allGroups.find(g => g.id === item.group_id) || {}).name || item.group_id;
      const hireDate = item.hire_date
        ? new Date(item.hire_date).toLocaleDateString('zh-CN')
        : '—';
      const nameEsc = escJs(item.name);

      return `
        <tr>
          <td><strong>${esc(item.name)}</strong></td>
          <td>${esc(item.gender || '—')}</td>
          <td>${item.age || '—'}</td>
          <td>${esc(item.phone || '—')}</td>
          <td>${esc(item.title || '—')}</td>
          <td>${hireDate}</td>
          <td>${esc(groupName)}</td>
          <td class="action-cell">
            <button class="btn-icon" title="查看" onclick="openPersonnelDialog(${item.id},'view')"><i class="fa-solid fa-eye"></i></button>
            <button class="btn-icon" title="编辑" onclick="openPersonnelDialog(${item.id},'edit')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-icon delete" title="删除" onclick="deletePersonnelRecord(${item.id},'${nameEsc}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('加载人员列表失败:', err);
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#ef4444;">加载失败: ' + esc(err.message) + '</td></tr>';
  }
}

// ============================================
// 搜索 / 清除
// ============================================
function doSearch() {
  loadPersonnelList(
    document.getElementById('searchInput').value,
    document.getElementById('dateFrom').value,
    document.getElementById('dateTo').value
  );
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('dateFrom').value = '';
  document.getElementById('dateTo').value = '';
  loadPersonnelList('', '', '');
}

// ============================================
// 加载小组列表
// ============================================
async function loadGroupOptions() {
  try {
    const resp = await http.get('/auth/groups');
    if (resp && resp.code === 200 && resp.data) {
      allGroups = resp.data;
      const sel = document.getElementById('editGroupId');
      if (sel) {
        sel.innerHTML = '<option value="">请选择小组</option>' +
          allGroups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
      }
    }
  } catch (err) {
    console.error('加载小组列表失败:', err);
  }
}

// ============================================
// 打开弹窗（三模式切换）
// ============================================
async function openPersonnelDialog(id, mode) {
  const modal = document.getElementById('personnelModal');
  const title = document.getElementById('personnelModalTitle');
  const formFields = document.getElementById('personnelFormFields');
  const readOnly = document.getElementById('personnelReadOnly');
  const actionsAddEdit = document.getElementById('actionsAddEdit');
  const actionsView = document.getElementById('actionsView');
  const editId = document.getElementById('editPersonnelId');

  editId.value = '';
  currentPhotoBase64 = '';

  // 确保小组列表已加载
  if (allGroups.length === 0) {
    await loadGroupOptions();
  }

  if (mode === 'view') {
    title.textContent = '人员详情';
    formFields.style.display = 'none';
    readOnly.style.display = '';
    actionsAddEdit.style.display = 'none';
    actionsView.style.display = '';

    try {
      const resp = await http.get('/hr/personnel/' + id);
      if (resp && resp.code === 200 && resp.data) {
        renderPersonnelDetail(resp.data);
      } else {
        document.getElementById('personnelDetailContent').innerHTML =
          '<p style="color:#ef4444;text-align:center;">数据加载失败</p>';
      }
    } catch (err) {
      document.getElementById('personnelDetailContent').innerHTML =
        '<p style="color:#ef4444;text-align:center;">加载失败: ' + esc(err.message) + '</p>';
    }
  } else if (mode === 'edit') {
    title.textContent = '编辑人员';
    formFields.style.display = '';
    readOnly.style.display = 'none';
    actionsAddEdit.style.display = '';
    actionsView.style.display = 'none';

    try {
      const resp = await http.get('/hr/personnel/' + id);
      if (resp && resp.code === 200 && resp.data) {
        editId.value = id;
        populatePersonnelForm(resp.data);
      } else {
        showToast('数据加载失败', 'error');
        return;
      }
    } catch (err) {
      showToast('加载失败: ' + (err.message || '网络错误'), 'error');
      return;
    }
  } else {
    // mode === 'add'
    title.textContent = '新增人员';
    formFields.style.display = '';
    readOnly.style.display = 'none';
    actionsAddEdit.style.display = '';
    actionsView.style.display = 'none';

    // 清空表单
    document.getElementById('editName').value = '';
    document.getElementById('editTitle').value = '';
    document.getElementById('editGender').value = '';
    document.getElementById('editAge').value = '';
    document.getElementById('editPhone').value = '';
    document.getElementById('editIdCard').value = '';
    document.getElementById('editHireDate').value = '';

    // 默认选中当前用户的小组
    const currentGroupId = (getGroup() || {}).id;
    const sel = document.getElementById('editGroupId');
    if (sel && currentGroupId) {
      sel.value = currentGroupId;
    }

    // 重置照片
    resetPhotoUI();
  }

  modal.style.display = 'flex';
}

// ============================================
// 填充编辑表单
// ============================================
function populatePersonnelForm(data) {
  document.getElementById('editName').value = data.name || '';
  document.getElementById('editTitle').value = data.title || '';
  document.getElementById('editGender').value = data.gender || '';
  document.getElementById('editAge').value = data.age || '';
  document.getElementById('editPhone').value = data.phone || '';
  document.getElementById('editIdCard').value = data.id_card || '';
  document.getElementById('editHireDate').value = data.hire_date ? data.hire_date.slice(0, 10) : '';

  const sel = document.getElementById('editGroupId');
  if (sel && data.group_id) {
    sel.value = data.group_id;
  }

  // 照片
  if (data.photo) {
    currentPhotoBase64 = data.photo;
    document.getElementById('photoPreviewImg').src = data.photo;
    document.getElementById('photoPreviewImg').style.display = '';
    document.getElementById('photoPlaceholder').style.display = 'none';
    document.getElementById('photoRemoveBtn').style.display = '';
  } else {
    resetPhotoUI();
  }
}

// ============================================
// 渲染查看模式 — CV 简历卡片
// ============================================
function renderPersonnelDetail(data) {
  const groupName = (allGroups.find(g => g.id === data.group_id) || {}).name || '—';
  const hireDate = data.hire_date
    ? new Date(data.hire_date).toLocaleDateString('zh-CN')
    : '—';
  const createdAt = data.created_at
    ? new Date(data.created_at).toLocaleString('zh-CN')
    : '—';
  const updatedAt = data.updated_at
    ? new Date(data.updated_at).toLocaleString('zh-CN')
    : '—';

  const html = `
    <div class="cv-layout">
      <div class="cv-photo-section">
        <div class="cv-photo-box">
          ${data.photo
            ? `<img src="${data.photo}" alt="证件照">`
            : `<div class="cv-photo-placeholder"><i class="fa-solid fa-user"></i><span>暂无照片</span></div>`
          }
        </div>
      </div>
      <div class="cv-details-section">
        <div class="cv-header-view">
          <div class="cv-view-name">${esc(data.name)}</div>
          <div class="cv-view-title">${esc(data.title || '—')}</div>
        </div>
        <div class="cv-details-grid-view">
          <div class="cv-field">
            <span class="cv-label">性别</span>
            <span class="cv-value">${esc(data.gender || '—')}</span>
          </div>
          <div class="cv-field">
            <span class="cv-label">年龄</span>
            <span class="cv-value">${data.age || '—'}</span>
          </div>
          <div class="cv-field">
            <span class="cv-label">手机号</span>
            <span class="cv-value">${esc(data.phone || '—')}</span>
          </div>
          <div class="cv-field">
            <span class="cv-label">身份证号</span>
            <span class="cv-value">${esc(data.id_card || '—')}</span>
          </div>
          <div class="cv-field">
            <span class="cv-label">入职日期</span>
            <span class="cv-value">${hireDate}</span>
          </div>
          <div class="cv-field">
            <span class="cv-label">所属小组</span>
            <span class="cv-value">${esc(groupName)}</span>
          </div>
        </div>
        <div class="cv-meta">
          <span>创建时间: ${createdAt}</span>
          <span>最后更新: ${updatedAt}</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('personnelDetailContent').innerHTML = html;
}

// ============================================
// 保存人员记录
// ============================================
async function savePersonnelRecord() {
  const id = document.getElementById('editPersonnelId').value;
  const name = document.getElementById('editName').value.trim();
  const title = document.getElementById('editTitle').value.trim();
  const gender = document.getElementById('editGender').value;
  const age = document.getElementById('editAge').value;
  const phone = document.getElementById('editPhone').value.trim();
  const idCard = document.getElementById('editIdCard').value.trim();
  const hireDate = document.getElementById('editHireDate').value;
  const groupId = document.getElementById('editGroupId').value;

  // 校验
  if (!name) { showToast('姓名不能为空', 'error'); return; }
  if (!gender) { showToast('请选择性别', 'error'); return; }

  const payload = {
    name,
    title,
    gender,
    age: age ? parseInt(age, 10) : null,
    phone,
    id_card: idCard,
    hire_date: hireDate || null,
    group_id: groupId ? parseInt(groupId, 10) : null,
    photo: currentPhotoBase64 || null
  };

  try {
    let resp;
    if (id) {
      resp = await http.put('/hr/personnel/' + id, payload);
    } else {
      resp = await http.post('/hr/personnel', payload);
    }

    if (resp && resp.code === 200) {
      showToast(id ? '人员更新成功' : '人员添加成功');
      closePersonnelDialog();
      doSearch();
    } else {
      showToast((resp || {}).message || '保存失败', 'error');
    }
  } catch (err) {
    showToast('保存失败: ' + (err.message || '网络错误'), 'error');
  }
}

// ============================================
// 删除人员
// ============================================
function deletePersonnelRecord(id, name) {
  showModal('确认删除',
    `<p>确定要删除人员 <strong>${esc(name)}</strong> 吗？此操作不可恢复。</p>`,
    async (overlay) => {
      try {
        const resp = await http.del('/hr/personnel/' + id);
        if (resp && resp.code === 200) {
          showToast('人员已删除');
          overlay.remove();
          loadPersonnelList(document.getElementById('searchInput').value);
        } else {
          showToast((resp || {}).message || '删除失败', 'error');
        }
      } catch (err) {
        showToast('删除失败: ' + (err.message || '网络错误'), 'error');
      }
    }
  );
}

// ============================================
// 关闭弹窗
// ============================================
function closePersonnelDialog() {
  document.getElementById('personnelModal').style.display = 'none';
}

// ============================================
// 照片上传处理
// ============================================
function handlePhotoUpload(input) {
  const file = input.files[0];
  if (!file) return;

  // 校验文件类型和大小
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件', 'error');
    input.value = '';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('图片大小不能超过 10MB', 'error');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    currentPhotoBase64 = e.target.result;
    document.getElementById('photoPreviewImg').src = e.target.result;
    document.getElementById('photoPreviewImg').style.display = '';
    document.getElementById('photoPlaceholder').style.display = 'none';
    document.getElementById('photoRemoveBtn').style.display = '';
  };
  reader.readAsDataURL(file);
}

// ============================================
// 移除照片
// ============================================
function removePhoto() {
  currentPhotoBase64 = '';
  resetPhotoUI();
  document.getElementById('photoInput').value = '';
}

function resetPhotoUI() {
  document.getElementById('photoPreviewImg').style.display = 'none';
  document.getElementById('photoPreviewImg').src = '';
  document.getElementById('photoPlaceholder').style.display = '';
  document.getElementById('photoRemoveBtn').style.display = 'none';
}

// ============================================
// 小组切换刷新
// ============================================
window.refreshPageData = async function () {
  await loadPersonnelList(
    (document.getElementById('searchInput') || {}).value || '',
    (document.getElementById('dateFrom') || {}).value || '',
    (document.getElementById('dateTo') || {}).value || ''
  );
};

// ============================================
// XSS 防护工具函数
// ============================================
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escJs(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}
