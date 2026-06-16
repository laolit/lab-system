/* ========================================
   设备台账 CRUD
   ======================================== */

let allGroups = []; // 小组缓存

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  renderUserInfo();
  document.getElementById('sidebarUserName').textContent =
    (getUser()?.display_name || getUser()?.username || '—');

  // 加载仪器列表和维护记录
  loadInstruments();
  loadMaintenanceRecords();
  loadUsageRecords();
  loadRepairRecords();

  // Tab 切换 — 切换到对应 Tab 时刷新数据
  document.querySelectorAll('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'maintenance') {
        loadMaintenanceRecords(
          document.getElementById('mtSearchInput')?.value || '',
          document.getElementById('mtDateFrom')?.value || '',
          document.getElementById('mtDateTo')?.value || ''
        );
      }
      if (btn.dataset.tab === 'usage') {
        loadUsageRecords(
          document.getElementById('urSearchInput')?.value || '',
          document.getElementById('urDateFrom')?.value || '',
          document.getElementById('urDateTo')?.value || ''
        );
      }
      if (btn.dataset.tab === 'repair') {
        loadRepairRecords(
          document.getElementById('rpSearchInput')?.value || '',
          document.getElementById('rpDateFrom')?.value || '',
          document.getElementById('rpDateTo')?.value || ''
        );
      }
      if (btn.dataset.tab === 'calibration') {
        loadCalibrationRecords();
      }
    });
  });

  // 搜索：回车触发
  document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadInstruments(e.target.value);
  });
  document.getElementById('mtSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doMaintenanceSearch();
  });
  document.getElementById('mtDateFrom').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doMaintenanceSearch();
  });
  document.getElementById('mtDateTo').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doMaintenanceSearch();
  });
  document.getElementById('urSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doUsageSearch();
  });
  document.getElementById('urDateFrom').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doUsageSearch();
  });
  document.getElementById('urDateTo').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doUsageSearch();
  });
  document.getElementById('rpSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doRepairSearch();
  });
  document.getElementById('rpDateFrom').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doRepairSearch();
  });
  document.getElementById('rpDateTo').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doRepairSearch();
  });
  document.getElementById('cfSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadCalibrationRecords(e.target.value);
  });

  // 点击遮罩关闭弹窗
  document.addEventListener('click', (e) => {
    if (e.target.id === 'instrumentModal') closeDialog();
    if (e.target.id === 'maintenanceModal') closeMaintenanceDialog();
    if (e.target.id === 'usageModal') closeUsageDialog();
    if (e.target.id === 'repairModal') closeRepairDialog();
    if (e.target.id === 'calibrationModal') closeCalibrationDialog();
    if (e.target.id === 'templateConfigModal') document.getElementById('templateConfigModal').style.display = 'none';
    if (e.target.id === 'usageTemplateConfigModal') document.getElementById('usageTemplateConfigModal').style.display = 'none';
    if (e.target.id === 'repairTemplateConfigModal') document.getElementById('repairTemplateConfigModal').style.display = 'none';
  });
});

// ============================================
// 加载仪器列表
// ============================================
async function loadInstruments(searchTerm) {
  const tbody = document.getElementById('instrumentTableBody');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#9ca3af;">加载中...</td></tr>';

  try {
    let url = '/equipment/instruments';
    if (searchTerm && searchTerm.trim()) {
      url += '?search=' + encodeURIComponent(searchTerm.trim());
    }

    const resp = await http.get(url);
    if (!resp || resp.code !== 200) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
      return;
    }

    const data = resp.data || [];
    if (data.length === 0) {
      const msg = searchTerm ? '未找到匹配的仪器' : '暂无仪器数据，点击「新增设备」添加';
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:#9ca3af;">${msg}</td></tr>`;
      return;
    }

    const statusMap = {
      in_use:    { label: '使用中', cls: 'in_use' },
      idle:      { label: '闲置',   cls: 'idle' },
      repairing: { label: '维修中', cls: 'repairing' },
      scrapped:  { label: '已报废', cls: 'scrapped' },
    };

    tbody.innerHTML = data.map(item => {
      const st = statusMap[item.status] || { label: item.status || '—', cls: '' };
      const addDate = item.add_date ? new Date(item.add_date).toLocaleDateString('zh-CN') : '—';
      return `
        <tr>
          <td><strong>${esc(item.name)}</strong></td>
          <td>${esc(item.model)}</td>
          <td><code style="font-size:12px;">${esc(item.serial_number || '—')}</code></td>
          <td>${esc(item.manufacturer)}</td>
          <td><span class="status-badge ${st.cls}">${st.label}</span></td>
          <td>${addDate}</td>
          <td>${esc(item.location || '—')}</td>
          <td>
            <button class="btn-icon" title="预览" onclick="openDialog(${item.id},'view')"><i class="fa-solid fa-eye"></i></button>
            <button class="btn-icon" title="编辑" onclick="openDialog(${item.id},'edit')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-icon delete" title="删除" onclick="deleteInstrument(${item.id},'${escJs(item.name)}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('加载仪器列表失败:', err);
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
  }
}

// ============================================
// 加载小组列表（供详情展示中的小组名称查找）
// ============================================
async function loadGroupOptions() {
  try {
    const resp = await http.get('/auth/groups');
    if (resp && resp.code === 200 && resp.data.length > 0) {
      allGroups = resp.data;
      const selectEl = document.getElementById('editGroupId');
      if (selectEl) {
        selectEl.innerHTML = '<option value="">请选择小组</option>' +
          allGroups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
      }
    }
  } catch (err) {
    console.error('加载小组列表失败:', err);
  }
}

// ============================================
// 打开对话框（add / edit / view 三模式）
// ============================================
async function openDialog(id, mode) {
  const modal = document.getElementById('instrumentModal');
  const title = document.getElementById('instrumentModalTitle');
  const formFields = document.getElementById('instrumentFormFields');
  const readOnly = document.getElementById('instrumentReadOnly');
  const actionsAddEdit = document.getElementById('actionsAddEdit');
  const actionsView = document.getElementById('actionsView');
  const editId = document.getElementById('editInstrumentId');

  // 重置
  editId.value = '';

  if (mode === 'view') {
    // 提前加载小组列表，供详情展示使用
    await loadGroupOptions();
  }

  if (mode === 'view') {
    // ====== 预览模式 ======
    title.textContent = '设备详情';
    formFields.style.display = 'none';
    readOnly.style.display = '';
    actionsAddEdit.style.display = 'none';
    actionsView.style.display = '';

    try {
      const resp = await http.get(`/equipment/instruments/${id}`);
      if (!resp || resp.code !== 200) {
        showToast('加载仪器详情失败', 'error');
        return;
      }
      renderDetail(resp.data);
    } catch (err) {
      console.error('加载详情失败:', err);
      showToast('加载仪器详情失败', 'error');
      return;
    }

  } else if (mode === 'edit') {
    // ====== 编辑模式 ======
    title.textContent = '编辑设备';
    formFields.style.display = '';
    readOnly.style.display = 'none';
    actionsAddEdit.style.display = '';
    actionsView.style.display = 'none';
    editId.value = id;

    try {
      const resp = await http.get(`/equipment/instruments/${id}`);
      if (!resp || resp.code !== 200) {
        showToast('加载仪器详情失败', 'error');
        return;
      }
      populateForm(resp.data);
    } catch (err) {
      console.error('加载详情失败:', err);
      showToast('加载仪器详情失败', 'error');
      return;
    }

  } else {
    // ====== 新增模式 ======
    title.textContent = '新增设备';
    formFields.style.display = '';
    readOnly.style.display = 'none';
    actionsAddEdit.style.display = '';
    actionsView.style.display = 'none';
    editId.value = '';

    // 清空表单并设默认值
    document.getElementById('editName').value = '';
    document.getElementById('editModel').value = '';
    document.getElementById('editSerial').value = '';
    document.getElementById('editManufacturer').value = '';
    document.getElementById('editPurchaseDate').value = '';
    document.getElementById('editAddDate').value = '';
    document.getElementById('editStatus').value = 'in_use';
    document.getElementById('editLocation').value = '';
    document.getElementById('editContactPerson').value = '';
    document.getElementById('editDailyMaintenance').value = '';
    document.getElementById('editWeeklyMaintenance').value = '';
    document.getElementById('editMonthlyMaintenance').value = '';
    document.getElementById('editRemarks').value = '';
  }

  modal.style.display = 'flex';
}

// ============================================
// 填充表单（编辑模式）
// ============================================
function populateForm(data) {
  document.getElementById('editName').value = data.name || '';
  document.getElementById('editModel').value = data.model || '';
  document.getElementById('editSerial').value = data.serial_number || '';
  document.getElementById('editManufacturer').value = data.manufacturer || '';
  document.getElementById('editPurchaseDate').value = data.purchase_date ? data.purchase_date.slice(0, 10) : '';
  document.getElementById('editAddDate').value = data.add_date ? data.add_date.slice(0, 10) : '';
  document.getElementById('editStatus').value = data.status || 'in_use';
  document.getElementById('editLocation').value = data.location || '';
  document.getElementById('editContactPerson').value = data.contact_person || '';
  document.getElementById('editDailyMaintenance').value = data.daily_maintenance || '';
  document.getElementById('editWeeklyMaintenance').value = data.weekly_maintenance || '';
  document.getElementById('editMonthlyMaintenance').value = data.monthly_maintenance || '';
  document.getElementById('editRemarks').value = data.remarks || '';
}

// ============================================
// 渲染详情（预览模式）
// ============================================
function renderDetail(data) {
  const statusMap = {
    in_use: '使用中', idle: '闲置', repairing: '维修中', scrapped: '已报废',
  };
  // 查找小组名称
  const groupName = allGroups.find(g => g.id === data.group_id)?.name || '—';

  const fields = [
    { label: '仪器名称', value: data.name },
    { label: '仪器型号', value: data.model },
    { label: '序列号', value: data.serial_number },
    { label: '仪器厂商', value: data.manufacturer },
    { label: '所属小组', value: groupName },
    { label: '购置日期', value: data.purchase_date ? new Date(data.purchase_date).toLocaleDateString('zh-CN') : null },
    { label: '添加日期', value: data.add_date ? new Date(data.add_date).toLocaleDateString('zh-CN') : null },
    { label: '仪器状态', value: statusMap[data.status] || data.status },
    { label: '存放位置', value: data.location },
    { label: '负责人', value: data.contact_person },
    { label: '日维护', value: data.daily_maintenance },
    { label: '周维护', value: data.weekly_maintenance },
    { label: '月维护', value: data.monthly_maintenance },
    { label: '备注', value: data.remarks, full: true },
  ];

  const html = fields.map(f => {
    const valHtml = f.value
      ? `<div class="detail-value">${esc(f.value)}</div>`
      : `<div class="detail-value empty">—</div>`;
    const fullClass = f.full ? ' full' : '';
    return `<div class="detail-item${fullClass}"><span class="detail-label">${f.label}</span>${valHtml}</div>`;
  }).join('');

  // 额外显示创建/更新时间
  const metaHtml = `
    <div class="detail-item">
      <span class="detail-label">创建时间</span>
      <div class="detail-value">${data.created_at ? new Date(data.created_at).toLocaleString('zh-CN') : '—'}</div>
    </div>
    <div class="detail-item">
      <span class="detail-label">最后更新</span>
      <div class="detail-value">${data.updated_at ? new Date(data.updated_at).toLocaleString('zh-CN') : '—'}</div>
    </div>
  `;

  document.getElementById('detailContent').innerHTML = '<div class="detail-grid">' + html + metaHtml + '</div>';
}

// ============================================
// 关闭弹窗
// ============================================
function closeDialog() {
  document.getElementById('instrumentModal').style.display = 'none';
}

// ============================================
// 保存仪器（新增/编辑）
// ============================================
async function saveInstrument() {
  const id = document.getElementById('editInstrumentId').value;
  const name = document.getElementById('editName').value.trim();
  const model = document.getElementById('editModel').value.trim();
  const serial_number = document.getElementById('editSerial').value.trim();
  const manufacturer = document.getElementById('editManufacturer').value.trim();
  const purchase_date = document.getElementById('editPurchaseDate').value;
  const add_date = document.getElementById('editAddDate').value;
  const status = document.getElementById('editStatus').value;
  const location = document.getElementById('editLocation').value.trim();
  const contact_person = document.getElementById('editContactPerson').value.trim();
  const daily_maintenance = document.getElementById('editDailyMaintenance').value.trim();
  const weekly_maintenance = document.getElementById('editWeeklyMaintenance').value.trim();
  const monthly_maintenance = document.getElementById('editMonthlyMaintenance').value.trim();
  const remarks = document.getElementById('editRemarks').value.trim();

  // 验证
  if (!name) { showToast('仪器名称不能为空', 'error'); return; }
  if (!model) { showToast('仪器型号不能为空', 'error'); return; }
  if (!manufacturer) { showToast('仪器厂商不能为空', 'error'); return; }

  const payload = { name, model, serial_number, manufacturer, purchase_date, add_date, status, location, contact_person, daily_maintenance, weekly_maintenance, monthly_maintenance, remarks };

  try {
    let resp;
    if (id) {
      resp = await http.put(`/equipment/instruments/${id}`, payload);
    } else {
      resp = await http.post('/equipment/instruments', payload);
    }

    if (resp && resp.code === 200) {
      showToast(id ? '仪器更新成功' : '仪器添加成功');
      closeDialog();
      loadInstruments(document.getElementById('searchInput').value);
    } else {
      showToast(resp?.message || '保存失败', 'error');
    }
  } catch (err) {
    console.error('保存仪器失败:', err);
    showToast('保存失败: ' + (err.message || '网络错误'), 'error');
  }
}

// ============================================
// 删除仪器
// ============================================
function deleteInstrument(id, name) {
  showModal('确认删除', `<p>确定要删除仪器 <strong>${esc(name)}</strong> 吗？此操作不可恢复。</p>`, async (overlay) => {
    try {
      const resp = await http.del(`/equipment/instruments/${id}`);
      if (resp && resp.code === 200) {
        showToast('仪器已删除');
        overlay.remove();
        loadInstruments(document.getElementById('searchInput').value);
      } else {
        showToast(resp?.message || '删除失败', 'error');
      }
    } catch (err) {
      console.error('删除仪器失败:', err);
      showToast('删除失败: ' + (err.message || '网络错误'), 'error');
    }
  });
}

// ============================================
// 搜索
// ============================================
function doSearch() {
  const term = document.getElementById('searchInput').value;
  loadInstruments(term);
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  loadInstruments();
}

// ============================================
// 工具函数
// ============================================
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 供小组切换后刷新
window.refreshPageData = async function () {
  await loadInstruments(document.getElementById('searchInput')?.value || '');
  // 如果当前在维护记录 Tab，也刷新维护列表
  const mtPanel = document.getElementById('panel-maintenance');
  if (mtPanel && mtPanel.classList.contains('active')) {
    await loadMaintenanceRecords(
      document.getElementById('mtSearchInput')?.value || '',
      document.getElementById('mtDateFrom')?.value || '',
      document.getElementById('mtDateTo')?.value || ''
    );
  }
  // 如果当前在使用登记 Tab，也刷新使用登记列表
  const urPanel = document.getElementById('panel-usage');
  if (urPanel && urPanel.classList.contains('active')) {
    await loadUsageRecords(
      document.getElementById('urSearchInput')?.value || '',
      document.getElementById('urDateFrom')?.value || '',
      document.getElementById('urDateTo')?.value || ''
    );
  }
  // 如果当前在维修记录 Tab，也刷新维修列表
  const rpPanel = document.getElementById('panel-repair');
  if (rpPanel && rpPanel.classList.contains('active')) {
    await loadRepairRecords();
  }
  const cfPanel = document.getElementById('panel-calibration');
  if (cfPanel && cfPanel.classList.contains('active')) {
    await loadCalibrationRecords();
  }
};

// 用于 JS 字符串中嵌入到 onclick 属性时的转义
function escJs(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ============================================
// 日常维护与保养记录 — CRUD
// ============================================

async function loadMaintenanceRecords(searchTerm, dateFrom, dateTo) {
  const tbody = document.getElementById('maintenanceTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#9ca3af;">加载中...</td></tr>';

  try {
    const params = new URLSearchParams();
    if (searchTerm && searchTerm.trim()) {
      params.set('search', searchTerm.trim());
    }
    if (dateFrom) {
      params.set('date_from', dateFrom);
    }
    if (dateTo) {
      params.set('date_to', dateTo);
    }
    let url = '/equipment/maintenance';
    const qs = params.toString();
    if (qs) url += '?' + qs;

    const resp = await http.get(url);
    if (!resp || resp.code !== 200) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
      return;
    }

    const data = resp.data || [];
    if (data.length === 0) {
      const msg = searchTerm ? '未找到匹配的维护记录' : '暂无维护记录，点击「新增记录」添加';
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:#9ca3af;">${msg}</td></tr>`;
      return;
    }

    const typeBadge = {
      '日保养': 'mt-daily',
      '周保养': 'mt-weekly',
      '月保养': 'mt-monthly',
    };

    tbody.innerHTML = data.map(item => {
      const dateStr = item.maintenance_date ? new Date(item.maintenance_date).toLocaleDateString('zh-CN') : '—';
      const instLabel = item.instrument_name + (item.instrument_model ? ' (' + esc(item.instrument_model) + ')' : '');
      const badgeCls = typeBadge[item.maintenance_type] || '';
      return `
        <tr>
          <td><strong>${esc(item.instrument_name)}</strong><br><span style="font-size:12px;color:#9ca3af;">${esc(item.instrument_model || '')}</span></td>
          <td>${dateStr}</td>
          <td><span class="mt-type-badge ${badgeCls}">${esc(item.maintenance_type)}</span></td>
          <td>${esc(item.performed_by)}</td>
          <td>
            <button class="btn-icon" title="预览" onclick="openMaintenanceDialog(${item.id},'view')"><i class="fa-solid fa-eye"></i></button>
            <button class="btn-icon" title="编辑" onclick="openMaintenanceDialog(${item.id},'edit')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-icon delete" title="删除" onclick="deleteMaintenanceRecord(${item.id},'${escJs(item.instrument_name)} ${dateStr}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('加载维护记录列表失败:', err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
  }
}

let maintenanceInstrumentCache = []; // 缓存仪器数据供维护内容自动带入

async function loadInstrumentOptions() {
  try {
    const resp = await http.get('/equipment/instruments');
    const selectEl = document.getElementById('editMtInstrumentId');
    if (!selectEl) return;
    if (resp && resp.code === 200 && resp.data.length > 0) {
      maintenanceInstrumentCache = resp.data;
      selectEl.innerHTML = '<option value="">请选择仪器</option>' +
        resp.data.map(inst => `<option value="${inst.id}">${esc(inst.name)} (${esc(inst.model)})</option>`).join('');
    } else {
      maintenanceInstrumentCache = [];
      selectEl.innerHTML = '<option value="">无可用仪器</option>';
    }
  } catch (err) {
    console.error('加载仪器列表失败:', err);
  }
}

// 根据选中的仪器和保养类型自动带入维护内容
function autoFillMaintenanceContent() {
  const instId = document.getElementById('editMtInstrumentId').value;
  const mtType = document.getElementById('editMtType').value;
  const contentEl = document.getElementById('editMtContent');
  if (!contentEl) return;

  if (!instId || !mtType) {
    contentEl.value = '';
    return;
  }

  const inst = maintenanceInstrumentCache.find(i => i.id === parseInt(instId, 10));
  if (!inst) {
    contentEl.value = '';
    return;
  }

  let content = '';
  if (mtType === '日保养') {
    content = inst.daily_maintenance || '';
  } else if (mtType === '周保养') {
    content = inst.weekly_maintenance || '';
  } else if (mtType === '月保养') {
    content = inst.monthly_maintenance || '';
  }
  contentEl.value = content;
}

async function openMaintenanceDialog(id, mode) {
  const modal = document.getElementById('maintenanceModal');
  const title = document.getElementById('maintenanceModalTitle');
  const formFields = document.getElementById('maintenanceFormFields');
  const readOnly = document.getElementById('maintenanceReadOnly');
  const actionsAddEdit = document.getElementById('mtActionsAddEdit');
  const actionsView = document.getElementById('mtActionsView');
  const editId = document.getElementById('editMaintenanceId');

  editId.value = '';

  if (mode === 'view') {
    // ====== 预览模式 ======
    title.textContent = '维护记录详情';
    formFields.style.display = 'none';
    readOnly.style.display = '';
    actionsAddEdit.style.display = 'none';
    actionsView.style.display = '';

    try {
      const resp = await http.get(`/equipment/maintenance/${id}`);
      if (!resp || resp.code !== 200) {
        showToast('加载维护记录详情失败', 'error');
        return;
      }
      renderMaintenanceDetail(resp.data);
    } catch (err) {
      console.error('加载详情失败:', err);
      showToast('加载维护记录详情失败', 'error');
      return;
    }

  } else if (mode === 'edit') {
    // ====== 编辑模式 ======
    title.textContent = '编辑维护记录';
    formFields.style.display = '';
    readOnly.style.display = 'none';
    actionsAddEdit.style.display = '';
    actionsView.style.display = 'none';
    editId.value = id;

    await loadInstrumentOptions();

    try {
      const resp = await http.get(`/equipment/maintenance/${id}`);
      if (!resp || resp.code !== 200) {
        showToast('加载维护记录详情失败', 'error');
        return;
      }
      document.getElementById('editMtInstrumentId').value = resp.data.instrument_id;
      document.getElementById('editMtDate').value = resp.data.maintenance_date ? resp.data.maintenance_date.slice(0, 10) : '';
      document.getElementById('editMtType').value = resp.data.maintenance_type;
      document.getElementById('editMtPerformedBy').value = resp.data.performed_by || '';
      document.getElementById('editMtContent').value = resp.data.maintenance_content || '';
      document.getElementById('editMtRemarks').value = resp.data.remarks || '';
      // 编辑模式下加载仪器列表后，同样可触发自动带入
      autoFillMaintenanceContent();
    } catch (err) {
      console.error('加载详情失败:', err);
      showToast('加载维护记录详情失败', 'error');
      return;
    }

  } else {
    // ====== 新增模式 ======
    title.textContent = '新增维护记录';
    formFields.style.display = '';
    readOnly.style.display = 'none';
    actionsAddEdit.style.display = '';
    actionsView.style.display = 'none';
    editId.value = '';

    await loadInstrumentOptions();
    document.getElementById('editMtInstrumentId').value = '';
    document.getElementById('editMtDate').value = '';
    document.getElementById('editMtType').value = '';
    document.getElementById('editMtPerformedBy').value = '';
    document.getElementById('editMtContent').value = '';
    document.getElementById('editMtRemarks').value = '';
  }

  modal.style.display = 'flex';
}

function closeMaintenanceDialog() {
  document.getElementById('maintenanceModal').style.display = 'none';
}

function renderMaintenanceDetail(data) {
  const typeMap = { '日保养': '日保养', '周保养': '周保养', '月保养': '月保养' };
  const instLabel = (data.instrument_name || '—') + ' (' + (data.instrument_model || '—') + ')';

  const fields = [
    { label: '仪器', value: instLabel },
    { label: '保养日期', value: data.maintenance_date ? new Date(data.maintenance_date).toLocaleDateString('zh-CN') : null },
    { label: '保养类型', value: typeMap[data.maintenance_type] || data.maintenance_type },
    { label: '执行人', value: data.performed_by },
    { label: '维护内容', value: data.maintenance_content, full: true },
    { label: '备注', value: data.remarks, full: true },
  ];

  const html = fields.map(f => {
    const valHtml = f.value
      ? `<div class="detail-value">${esc(f.value)}</div>`
      : `<div class="detail-value empty">—</div>`;
    const fullClass = f.full ? ' full' : '';
    return `<div class="detail-item${fullClass}"><span class="detail-label">${f.label}</span>${valHtml}</div>`;
  }).join('');

  const metaHtml = `
    <div class="detail-item">
      <span class="detail-label">创建时间</span>
      <div class="detail-value">${data.created_at ? new Date(data.created_at).toLocaleString('zh-CN') : '—'}</div>
    </div>
    <div class="detail-item">
      <span class="detail-label">最后更新</span>
      <div class="detail-value">${data.updated_at ? new Date(data.updated_at).toLocaleString('zh-CN') : '—'}</div>
    </div>
  `;

  document.getElementById('maintenanceDetailContent').innerHTML = '<div class="detail-grid">' + html + metaHtml + '</div>';
}

async function saveMaintenanceRecord() {
  const id = document.getElementById('editMaintenanceId').value;
  const instrument_id = document.getElementById('editMtInstrumentId').value;
  const maintenance_date = document.getElementById('editMtDate').value;
  const maintenance_type = document.getElementById('editMtType').value;
  const performed_by = document.getElementById('editMtPerformedBy').value.trim();
  const maintenance_content = document.getElementById('editMtContent').value.trim();
  const remarks = document.getElementById('editMtRemarks').value.trim();

  // 验证
  if (!instrument_id) { showToast('请选择仪器', 'error'); return; }
  if (!maintenance_date) { showToast('请选择保养日期', 'error'); return; }
  if (!maintenance_type) { showToast('请选择保养类型', 'error'); return; }
  if (!performed_by) { showToast('执行人不能为空', 'error'); return; }

  const payload = { instrument_id: parseInt(instrument_id, 10), maintenance_date, maintenance_type, performed_by, maintenance_content, remarks };

  try {
    let resp;
    if (id) {
      resp = await http.put(`/equipment/maintenance/${id}`, payload);
    } else {
      resp = await http.post('/equipment/maintenance', payload);
    }

    if (resp && resp.code === 200) {
      showToast(id ? '维护记录更新成功' : '维护记录添加成功');
      closeMaintenanceDialog();
      loadMaintenanceRecords(
        document.getElementById('mtSearchInput').value,
        document.getElementById('mtDateFrom').value,
        document.getElementById('mtDateTo').value
      );
    } else {
      showToast(resp?.message || '保存失败', 'error');
    }
  } catch (err) {
    console.error('保存维护记录失败:', err);
    showToast('保存失败: ' + (err.message || '网络错误'), 'error');
  }
}

function deleteMaintenanceRecord(id, desc) {
  showModal('确认删除', `<p>确定要删除维护记录 <strong>${esc(desc)}</strong> 吗？此操作不可恢复。</p>`, async (overlay) => {
    try {
      const resp = await http.del(`/equipment/maintenance/${id}`);
      if (resp && resp.code === 200) {
        showToast('维护记录已删除');
        overlay.remove();
        loadMaintenanceRecords(
          document.getElementById('mtSearchInput').value,
          document.getElementById('mtDateFrom').value,
          document.getElementById('mtDateTo').value
        );
      } else {
        showToast(resp?.message || '删除失败', 'error');
      }
    } catch (err) {
      console.error('删除维护记录失败:', err);
      showToast('删除失败: ' + (err.message || '网络错误'), 'error');
    }
  });
}

function doMaintenanceSearch() {
  const term = document.getElementById('mtSearchInput').value;
  const dateFrom = document.getElementById('mtDateFrom').value;
  const dateTo = document.getElementById('mtDateTo').value;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    showToast('开始日期不能晚于结束日期', 'error');
    return;
  }
  loadMaintenanceRecords(term, dateFrom, dateTo);
}

function clearMaintenanceSearch() {
  document.getElementById('mtSearchInput').value = '';
  document.getElementById('mtDateFrom').value = '';
  document.getElementById('mtDateTo').value = '';
  loadMaintenanceRecords();
}

// ============================================
// 打印模板配置
// ============================================

const TEMPLATE_STORAGE_KEY = 'maintenance_print_template_v4';

function getDefaultTemplate() {
  return {
    title: '仪器设备保养登记表',
    orgName: '中国医学科学院血液病医院精准医学诊断中心',
    orgSubtitle: '（天津市静海区团泊大道 28 号）',
    orientation: 'portrait',
    fontSize: 12,
    fontFamily: '楷体, KaiTi, 楷体_GB2312, STKaiti, serif',
    columns: [
      { key: 'row_num',            label: '序号',     visible: true,  width: '5%' },
      { key: 'maintenance_date',   label: '保养日期', visible: true,  width: '10%' },
      { key: 'instrument_name',    label: '仪器名称', visible: true,  width: '14%' },
      { key: 'instrument_model',   label: '仪器型号', visible: true,  width: '10%' },
      { key: 'maintenance_type',   label: '保养类型', visible: true,  width: '8%' },
      { key: 'performed_by',       label: '执行人',   visible: true,  width: '8%' },
      { key: 'maintenance_content',label: '维护内容', visible: true,  width: '22%' },
      { key: 'remarks',            label: '备注',     visible: true,  width: '23%' },
    ],
    headerText: '',
    footerText: '检验人签名: ________    审核人签名: ________    日期: ________',
    docInfo: '',
    bgOpacity: 0.06,
  };
}

function loadTemplateConfig() {
  try {
    const stored = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 合并默认值以兼容未来新增字段
      return Object.assign({}, getDefaultTemplate(), parsed);
    }
  } catch (e) { /* ignore */ }
  return getDefaultTemplate();
}

function saveTemplateConfigToStorage(config) {
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(config));
}

function openTemplateConfig() {
  const tpl = loadTemplateConfig();
  const modal = document.getElementById('templateConfigModal');
  document.getElementById('tplOrgName').value = tpl.orgName || '';
  document.getElementById('tplOrgSubtitle').value = tpl.orgSubtitle || '';
  document.getElementById('tplTitle').value = tpl.title || '';
  document.getElementById('tplDocInfo').value = tpl.docInfo || '';
  document.getElementById('tplOrientation').value = tpl.orientation || 'portrait';
  document.getElementById('tplFontSize').value = String(tpl.fontSize || 12);
  if (document.getElementById('tplFontFamily')) {
    document.getElementById('tplFontFamily').value = tpl.fontFamily || '楷体, KaiTi, 楷体_GB2312, STKaiti, serif';
  }
  if (document.getElementById('tplBgOpacity')) {
    const opacity = typeof tpl.bgOpacity === 'number' ? tpl.bgOpacity : 0.06;
    // 找到最接近的选项值
    const sel = document.getElementById('tplBgOpacity');
    const vals = [0, 0.03, 0.06, 0.10, 0.15, 0.20];
    let closest = vals[0], minDiff = Infinity;
    for (const v of vals) {
      const diff = Math.abs(v - opacity);
      if (diff < minDiff) { minDiff = diff; closest = v; }
    }
    sel.value = String(closest);
  }
  document.getElementById('tplHeader').value = tpl.headerText || '';
  document.getElementById('tplFooter').value = tpl.footerText || '';

  // 渲染列配置
  const colsList = document.getElementById('tplColumnsList');
  colsList.innerHTML = tpl.columns.map((col, idx) => `
    <div class="tpl-col-row">
      <label class="tpl-col-check">
        <input type="checkbox" data-col-idx="${idx}" ${col.visible ? 'checked' : ''}>
        <span>${esc(col.label)}</span>
      </label>
      <input type="text" class="tpl-col-label-input" data-col-idx="${idx}" value="${esc(col.label)}" placeholder="列标题">
    </div>
  `).join('');

  modal.style.display = 'flex';
}

function saveTemplateConfig() {
  const tpl = loadTemplateConfig();
  tpl.orgName = document.getElementById('tplOrgName').value.trim();
  tpl.orgSubtitle = document.getElementById('tplOrgSubtitle').value.trim();
  tpl.title = document.getElementById('tplTitle').value.trim() || '仪器设备保养登记表';
  tpl.docInfo = document.getElementById('tplDocInfo').value.trim();
  tpl.orientation = document.getElementById('tplOrientation').value;
  tpl.fontSize = parseInt(document.getElementById('tplFontSize').value, 10) || 12;
  if (document.getElementById('tplFontFamily')) {
    tpl.fontFamily = document.getElementById('tplFontFamily').value;
  }
  if (document.getElementById('tplBgOpacity')) {
    tpl.bgOpacity = parseFloat(document.getElementById('tplBgOpacity').value) || 0;
  }
  tpl.headerText = document.getElementById('tplHeader').value.trim();
  tpl.footerText = document.getElementById('tplFooter').value.trim();

  // 校验：至少保留 1 列可见
  let visibleCount = 0;
  document.querySelectorAll('#tplColumnsList .tpl-col-row').forEach((row, idx) => {
    if (tpl.columns[idx]) {
      const cb = row.querySelector('input[type="checkbox"]');
      const labelInput = row.querySelector('.tpl-col-label-input');
      tpl.columns[idx].visible = cb.checked;
      tpl.columns[idx].label = labelInput.value.trim() || tpl.columns[idx].label;
      if (cb.checked) visibleCount++;
    }
  });

  if (visibleCount === 0) {
    showToast('请至少选择一列显示', 'error');
    return;
  }

  saveTemplateConfigToStorage(tpl);
  document.getElementById('templateConfigModal').style.display = 'none';
  showToast('打印模板已保存');
}

function resetTemplateToDefault() {
  const tpl = getDefaultTemplate();
  saveTemplateConfigToStorage(tpl);
  openTemplateConfig();
  showToast('模板已恢复为默认设置');
}

// ============================================
// 打印维护记录
// ============================================

async function printMaintenanceRecords() {
  const term = document.getElementById('mtSearchInput').value;
  const dateFrom = document.getElementById('mtDateFrom').value;
  const dateTo = document.getElementById('mtDateTo').value;

  if (dateFrom && dateTo && dateFrom > dateTo) {
    showToast('开始日期不能晚于结束日期', 'error');
    return;
  }

  // 重新请求当前筛选条件下的完整数据
  const params = new URLSearchParams();
  if (term) params.set('search', term.trim());
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  let url = '/equipment/maintenance';
  const qs = params.toString();
  if (qs) url += '?' + qs;

  try {
    const resp = await http.get(url);
    if (!resp || resp.code !== 200 || !resp.data || resp.data.length === 0) {
      showToast('没有可打印的数据', 'error');
      return;
    }
    buildPrintWindow(resp.data, dateFrom, dateTo);
  } catch (err) {
    console.error('获取打印数据失败:', err);
    showToast('获取打印数据失败', 'error');
  }
}

function buildPrintWindow(records, dateFrom, dateTo) {
  const tpl = loadTemplateConfig();
  const visibleCols = tpl.columns.filter(c => c.visible);
  const user = getUser();
  const group = getGroup();

  // 格式化日期范围
  let dateRangeStr = '';
  if (dateFrom && dateTo) {
    dateRangeStr = `${dateFrom} 至 ${dateTo}`;
  } else if (dateFrom) {
    dateRangeStr = `${dateFrom} 起`;
  } else if (dateTo) {
    dateRangeStr = `截至 ${dateTo}`;
  } else {
    dateRangeStr = '全部日期';
  }

  const now = new Date().toLocaleString('zh-CN');
  const orientationStyle = tpl.orientation === 'landscape'
    ? '@page { size: A4 landscape; margin: 15mm; }'
    : '@page { size: A4 portrait; margin: 15mm; }';

  // 背景水印 — SVG pattern 平铺倾斜（保持图片大小，减少数量到 1/3）
  const bgOpacity = typeof tpl.bgOpacity === 'number' ? tpl.bgOpacity : 0.06;
  const bgSvg = (bgOpacity > 0)
    ? `<svg width="100%" height="100%" style="position:fixed;top:0;left:0;z-index:-1;pointer-events:none;" aria-hidden="true">
      <defs>
        <pattern id="watermark" width="540" height="90" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)">
          <image href="/images/logo.png" x="90" y="22" width="360" height="45" preserveAspectRatio="xMidYMid meet"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#watermark)" opacity="${bgOpacity}"/>
    </svg>`
    : '';
  const bgStyle = '';

  // 字体
  const fontFamily = tpl.fontFamily || '楷体, KaiTi, 楷体_GB2312, STKaiti, serif';

  // 表头
  const headerCells = visibleCols.map(col =>
    `<th style="width:${col.width || 'auto'}">${esc(col.label)}</th>`
  ).join('');

  // 表格内容
  const typeMap = { '日保养': '日保养', '周保养': '周保养', '月保养': '月保养' };
  const bodyRows = records.map((item, idx) => {
    const cells = visibleCols.map(col => {
      let val = '';
      switch (col.key) {
        case 'row_num':           val = idx + 1; break;
        case 'instrument_name':   val = item.instrument_name || ''; break;
        case 'instrument_model':  val = item.instrument_model || ''; break;
        case 'maintenance_date':  val = item.maintenance_date ? new Date(item.maintenance_date).toLocaleDateString('zh-CN') : ''; break;
        case 'maintenance_type':  val = typeMap[item.maintenance_type] || item.maintenance_type || ''; break;
        case 'performed_by':      val = item.performed_by || ''; break;
        case 'maintenance_content': val = item.maintenance_content || ''; break;
        case 'remarks':           val = item.remarks || ''; break;
        default: val = '';
      }
      return `<td>${esc(String(val))}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title></title>
  <style>
    ${orientationStyle}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontFamily};
      font-size: ${tpl.fontSize}px;
      color: #1f2937;
      padding: 24px 28px;
      position: relative;
      z-index: 0;
    }
    ${bgStyle}
    .print-org { text-align: center; margin-bottom: 2px; }
    .print-org .org-name { font-size: ${tpl.fontSize + 6}px; font-weight: 600; letter-spacing: 0.15em; font-family: ${fontFamily}; }
    .print-org .org-subtitle { font-size: ${tpl.fontSize - 1}px; color: #4b5563; margin-top: 2px; }
    .print-header { text-align: center; margin-bottom: 16px; margin-top: 12px; border-top: 2px solid #1f2937; border-bottom: 2px solid #1f2937; padding: 8px 0; }
    .print-header h2 { font-size: ${tpl.fontSize + 6}px; letter-spacing: 0.5em; font-weight: 700; }
    .print-header .meta { font-size: ${tpl.fontSize - 1}px; color: #6b7280; margin-top: 4px; }
    .print-header .header-text { margin-top: 4px; font-size: ${tpl.fontSize - 1}px; color: #374151; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    th, td { border: 1px solid #374151; padding: 6px 8px; text-align: center; }
    th { background-color: #e5e7eb; font-weight: 600; }
    td { text-align: left; }
    td:first-child, td:nth-child(2), td:nth-child(5) { text-align: center; }
    tr:nth-child(even) td { background-color: #fafafa; }
    .print-footer { margin-top: 20px; font-size: ${tpl.fontSize - 1}px; }
    .print-footer .footer-text { margin-top: 10px; white-space: pre-line; }
    .print-footer .meta-info { color: #9ca3af; margin-top: 6px; text-align: right; }
    @media print {
      body { padding: 0; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  ${bgSvg}
  <div class="print-org">
    <div class="org-name">${esc(tpl.orgName || '')}</div>
    ${tpl.orgSubtitle ? `<div class="org-subtitle">${esc(tpl.orgSubtitle)}</div>` : ''}
  </div>
  <div class="print-header">
    <h2>${esc(tpl.title)}</h2>
    <div class="meta">小组: ${esc(group?.name || '—')} &nbsp;|&nbsp; 日期范围: ${dateRangeStr} &nbsp;|&nbsp; 记录数: ${records.length} 条</div>
    <div class="meta">打印人: ${esc(user?.display_name || user?.username || '—')} &nbsp;|&nbsp; 打印时间: ${now}</div>
    ${tpl.headerText ? `<div class="header-text">${esc(tpl.headerText)}</div>` : ''}
  </div>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="print-footer">
    ${tpl.footerText ? `<div class="footer-text">${esc(tpl.footerText)}</div>` : ''}
    ${tpl.docInfo ? `<div class="doc-info" style="margin-top:6px;color:#6b7280;">${esc(tpl.docInfo)}</div>` : ''}
    <div class="meta-info">共 ${records.length} 条</div>
  </div>
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;

  // 使用隐藏 iframe 打印，避免 "about:blank" 出现在打印预览头部
  removeWatermarkIframe();
  const iframe = document.createElement('iframe');
  iframe.id = '__print_iframe__';
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:99999;background:#fff;';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  // 打印完成后移除 iframe
  iframe.contentWindow.onafterprint = function () {
    removeWatermarkIframe();
  };
  // 兜底：用户取消打印也移除
  setTimeout(function () {
    if (document.getElementById('__print_iframe__')) {
      removeWatermarkIframe();
    }
  }, 60000);
}

function removeWatermarkIframe() {
  const el = document.getElementById('__print_iframe__');
  if (el) el.remove();
}

// ============================================
// 使用登记记录 — CRUD
// ============================================

let usageInstrumentCache = []; // 缓存仪器列表供型号联动

async function loadUsageRecords(searchTerm, dateFrom, dateTo) {
  const tbody = document.getElementById('usageTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#9ca3af;">加载中...</td></tr>';

  try {
    const params = new URLSearchParams();
    if (searchTerm && searchTerm.trim()) {
      params.set('search', searchTerm.trim());
    }
    if (dateFrom) {
      params.set('date_from', dateFrom);
    }
    if (dateTo) {
      params.set('date_to', dateTo);
    }
    let url = '/equipment/usage';
    const qs = params.toString();
    if (qs) url += '?' + qs;

    const resp = await http.get(url);
    if (!resp || resp.code !== 200) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
      return;
    }

    const data = resp.data || [];
    if (data.length === 0) {
      const msg = (searchTerm || dateFrom || dateTo) ? '未找到匹配的使用登记记录' : '暂无使用登记记录，点击「新增记录」添加';
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#9ca3af;">${msg}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(item => {
      const dateStr = item.usage_date ? new Date(item.usage_date).toLocaleDateString('zh-CN') : '—';
      const startStr = item.start_time ? new Date(item.start_time).toLocaleString('zh-CN') : '—';
      const endStr = item.end_time ? new Date(item.end_time).toLocaleString('zh-CN') : '—';
      const instLabel = item.instrument_name + (item.instrument_model ? ' (' + esc(item.instrument_model) + ')' : '');
      return `
        <tr>
          <td><strong>${esc(item.instrument_name)}</strong><br><span style="font-size:12px;color:#9ca3af;">${esc(item.instrument_model || '')}</span></td>
          <td>${dateStr}</td>
          <td>${startStr}</td>
          <td>${endStr}</td>
          <td>${esc(item.sample_type || '—')}</td>
          <td>${esc(item.operator)}</td>
          <td>
            <button class="btn-icon" title="预览" onclick="openUsageDialog(${item.id},'view')"><i class="fa-solid fa-eye"></i></button>
            <button class="btn-icon" title="编辑" onclick="openUsageDialog(${item.id},'edit')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-icon delete" title="删除" onclick="deleteUsageRecord(${item.id},'${escJs(item.instrument_name)} ${dateStr}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('加载使用登记列表失败:', err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
  }
}

async function loadUsageInstrumentOptions() {
  try {
    const resp = await http.get('/equipment/instruments');
    const selectEl = document.getElementById('editUrInstrumentId');
    if (!selectEl) return;
    if (resp && resp.code === 200 && resp.data.length > 0) {
      usageInstrumentCache = resp.data;
      selectEl.innerHTML = '<option value="">请选择仪器</option>' +
        resp.data.map(inst => `<option value="${inst.id}" data-model="${esc(inst.model)}">${esc(inst.name)} (${esc(inst.model)})</option>`).join('');
    } else {
      usageInstrumentCache = [];
      selectEl.innerHTML = '<option value="">无可用仪器</option>';
    }
  } catch (err) {
    console.error('加载仪器列表失败:', err);
  }
}

function onUsageInstrumentChange() {
  const selectEl = document.getElementById('editUrInstrumentId');
  const modelEl = document.getElementById('editUrModel');
  if (!selectEl || !modelEl) return;
  const selectedOption = selectEl.selectedOptions[0];
  if (selectedOption && selectedOption.dataset.model) {
    modelEl.value = selectedOption.dataset.model;
  } else {
    modelEl.value = '';
  }
}

async function openUsageDialog(id, mode) {
  const modal = document.getElementById('usageModal');
  const title = document.getElementById('usageModalTitle');
  const formFields = document.getElementById('usageFormFields');
  const readOnly = document.getElementById('usageReadOnly');
  const actionsAddEdit = document.getElementById('urActionsAddEdit');
  const actionsView = document.getElementById('urActionsView');
  const editId = document.getElementById('editUsageId');

  editId.value = '';

  if (mode === 'view') {
    // ====== 预览模式 ======
    title.textContent = '使用登记记录详情';
    formFields.style.display = 'none';
    readOnly.style.display = '';
    actionsAddEdit.style.display = 'none';
    actionsView.style.display = '';

    try {
      const resp = await http.get(`/equipment/usage/${id}`);
      if (!resp || resp.code !== 200) {
        showToast('加载使用登记详情失败', 'error');
        return;
      }
      renderUsageDetail(resp.data);
    } catch (err) {
      console.error('加载详情失败:', err);
      showToast('加载使用登记详情失败', 'error');
      return;
    }

  } else if (mode === 'edit') {
    // ====== 编辑模式 ======
    title.textContent = '编辑使用登记记录';
    formFields.style.display = '';
    readOnly.style.display = 'none';
    actionsAddEdit.style.display = '';
    actionsView.style.display = 'none';
    editId.value = id;

    await loadUsageInstrumentOptions();

    try {
      const resp = await http.get(`/equipment/usage/${id}`);
      if (!resp || resp.code !== 200) {
        showToast('加载使用登记详情失败', 'error');
        return;
      }
      document.getElementById('editUrInstrumentId').value = resp.data.instrument_id;
      // 同步型号
      const opt = document.querySelector(`#editUrInstrumentId option[value="${resp.data.instrument_id}"]`);
      document.getElementById('editUrModel').value = opt ? opt.dataset.model : (resp.data.instrument_model || '');
      document.getElementById('editUrDate').value = resp.data.usage_date ? resp.data.usage_date.slice(0, 10) : '';
      document.getElementById('editUrStartTime').value = resp.data.start_time ? resp.data.start_time.replace('Z', '').slice(0, 16) : '';
      document.getElementById('editUrEndTime').value = resp.data.end_time ? resp.data.end_time.replace('Z', '').slice(0, 16) : '';
      document.getElementById('editUrSampleType').value = resp.data.sample_type || '';
      document.getElementById('editUrSampleCount').value = resp.data.sample_count || '';
      document.getElementById('editUrFunction').value = resp.data.usage_function || '常规';
      document.getElementById('editUrStatus').value = resp.data.instrument_status || '常规';
      document.getElementById('editUrFault').value = resp.data.fault_handling || '';
      document.getElementById('editUrOperator').value = resp.data.operator || '';
      document.getElementById('editUrRemarks').value = resp.data.remarks || '';
    } catch (err) {
      console.error('加载详情失败:', err);
      showToast('加载使用登记详情失败', 'error');
      return;
    }

  } else {
    // ====== 新增模式 ======
    title.textContent = '新增使用登记记录';
    formFields.style.display = '';
    readOnly.style.display = 'none';
    actionsAddEdit.style.display = '';
    actionsView.style.display = 'none';
    editId.value = '';

    await loadUsageInstrumentOptions();
    document.getElementById('editUrInstrumentId').value = '';
    document.getElementById('editUrModel').value = '';
    document.getElementById('editUrDate').value = '';
    document.getElementById('editUrStartTime').value = '';
    document.getElementById('editUrEndTime').value = '';
    document.getElementById('editUrSampleType').value = '';
    document.getElementById('editUrSampleCount').value = '';
    document.getElementById('editUrFunction').value = '常规';
    document.getElementById('editUrStatus').value = '常规';
    document.getElementById('editUrFault').value = '';
    document.getElementById('editUrOperator').value = '';
    document.getElementById('editUrRemarks').value = '';
  }

  modal.style.display = 'flex';
}

function closeUsageDialog() {
  document.getElementById('usageModal').style.display = 'none';
}

function renderUsageDetail(data) {
  const instLabel = (data.instrument_name || '—') + ' (' + (data.instrument_model || '—') + ')';

  const fields = [
    { label: '仪器', value: instLabel },
    { label: '使用日期', value: data.usage_date ? new Date(data.usage_date).toLocaleDateString('zh-CN') : null },
    { label: '开始使用时间', value: data.start_time ? new Date(data.start_time).toLocaleString('zh-CN') : null },
    { label: '终止使用时间', value: data.end_time ? new Date(data.end_time).toLocaleString('zh-CN') : null },
    { label: '标本类型', value: data.sample_type },
    { label: '标本数量', value: data.sample_count != null ? String(data.sample_count) : null },
    { label: '使用仪器何功能', value: data.usage_function },
    { label: '仪器状态', value: data.instrument_status },
    { label: '故障原因及处理', value: data.fault_handling, full: true },
    { label: '操作人', value: data.operator },
    { label: '备注', value: data.remarks, full: true },
  ];

  const html = fields.map(f => {
    const valHtml = f.value
      ? `<div class="detail-value">${esc(f.value)}</div>`
      : `<div class="detail-value empty">—</div>`;
    const fullClass = f.full ? ' full' : '';
    return `<div class="detail-item${fullClass}"><span class="detail-label">${f.label}</span>${valHtml}</div>`;
  }).join('');

  const metaHtml = `
    <div class="detail-item">
      <span class="detail-label">创建时间</span>
      <div class="detail-value">${data.created_at ? new Date(data.created_at).toLocaleString('zh-CN') : '—'}</div>
    </div>
    <div class="detail-item">
      <span class="detail-label">最后更新</span>
      <div class="detail-value">${data.updated_at ? new Date(data.updated_at).toLocaleString('zh-CN') : '—'}</div>
    </div>
  `;

  document.getElementById('usageDetailContent').innerHTML = '<div class="detail-grid">' + html + metaHtml + '</div>';
}

async function saveUsageRecord() {
  const id = document.getElementById('editUsageId').value;
  const instrument_id = document.getElementById('editUrInstrumentId').value;
  const usage_date = document.getElementById('editUrDate').value;
  const start_time = document.getElementById('editUrStartTime').value;
  const end_time = document.getElementById('editUrEndTime').value;
  const sample_type = document.getElementById('editUrSampleType').value.trim();
  const sample_count = document.getElementById('editUrSampleCount').value;
  const usage_function = document.getElementById('editUrFunction').value.trim();
  const instrument_status = document.getElementById('editUrStatus').value.trim();
  const fault_handling = document.getElementById('editUrFault').value.trim();
  const operator = document.getElementById('editUrOperator').value.trim();
  const remarks = document.getElementById('editUrRemarks').value.trim();

  // 验证
  if (!instrument_id) { showToast('请选择仪器', 'error'); return; }
  if (!usage_date) { showToast('请选择使用日期', 'error'); return; }
  if (!start_time) { showToast('请选择开始使用时间', 'error'); return; }
  if (!operator) { showToast('操作人不能为空', 'error'); return; }

  const payload = {
    instrument_id: parseInt(instrument_id, 10),
    usage_date,
    start_time: start_time + ':00',
    end_time: end_time ? end_time + ':00' : null,
    sample_type,
    sample_count: sample_count ? parseInt(sample_count, 10) : null,
    usage_function: usage_function || '常规',
    instrument_status: instrument_status || '常规',
    fault_handling,
    operator,
    remarks
  };

  try {
    let resp;
    if (id) {
      resp = await http.put(`/equipment/usage/${id}`, payload);
    } else {
      resp = await http.post('/equipment/usage', payload);
    }

    if (resp && resp.code === 200) {
      showToast(id ? '使用登记记录更新成功' : '使用登记记录添加成功');
      closeUsageDialog();
      const urDateFrom = document.getElementById('urDateFrom')?.value || '';
      const urDateTo = document.getElementById('urDateTo')?.value || '';
      loadUsageRecords(document.getElementById('urSearchInput').value, urDateFrom, urDateTo);
    } else {
      showToast(resp?.message || '保存失败', 'error');
    }
  } catch (err) {
    console.error('保存使用登记记录失败:', err);
    showToast('保存失败: ' + (err.message || '网络错误'), 'error');
  }
}

function deleteUsageRecord(id, desc) {
  showModal('确认删除', `<p>确定要删除使用登记记录 <strong>${esc(desc)}</strong> 吗？此操作不可恢复。</p>`, async (overlay) => {
    try {
      const resp = await http.del(`/equipment/usage/${id}`);
      if (resp && resp.code === 200) {
        showToast('使用登记记录已删除');
        overlay.remove();
        const urDateFrom = document.getElementById('urDateFrom')?.value || '';
        const urDateTo = document.getElementById('urDateTo')?.value || '';
        loadUsageRecords(document.getElementById('urSearchInput').value, urDateFrom, urDateTo);
      } else {
        showToast(resp?.message || '删除失败', 'error');
      }
    } catch (err) {
      console.error('删除使用登记记录失败:', err);
      showToast('删除失败: ' + (err.message || '网络错误'), 'error');
    }
  });
}

function doUsageSearch() {
  const term = document.getElementById('urSearchInput').value;
  const dateFrom = document.getElementById('urDateFrom')?.value || '';
  const dateTo = document.getElementById('urDateTo')?.value || '';

  if (dateFrom && dateTo && dateFrom > dateTo) {
    showToast('开始日期不能晚于结束日期', 'error');
    return;
  }

  loadUsageRecords(term, dateFrom, dateTo);
}

function clearUsageSearch() {
  document.getElementById('urSearchInput').value = '';
  if (document.getElementById('urDateFrom')) document.getElementById('urDateFrom').value = '';
  if (document.getElementById('urDateTo')) document.getElementById('urDateTo').value = '';
  loadUsageRecords();
}

// ============================================
// 使用登记记录 — 打印模板配置
// ============================================

const USAGE_TEMPLATE_STORAGE_KEY = 'usage_print_template_v1';

function getUsageDefaultTemplate() {
  return {
    title: '仪器设备使用登记表',
    orgName: '中国医学科学院血液病医院精准医学诊断中心',
    orgSubtitle: '（天津市静海区团泊大道 28 号）',
    orientation: 'portrait',
    fontSize: 12,
    fontFamily: '楷体, KaiTi, 楷体_GB2312, STKaiti, serif',
    columns: [
      { key: 'row_num',          label: '序号',         visible: true,  width: '5%' },
      { key: 'usage_date',       label: '使用日期',     visible: true,  width: '11%' },
      { key: 'instrument_name',  label: '仪器名称',     visible: true,  width: '15%' },
      { key: 'instrument_model', label: '仪器型号',     visible: true,  width: '11%' },
      { key: 'sample_type',      label: '标本类型',     visible: true,  width: '10%' },
      { key: 'sample_count',     label: '标本数量',     visible: true,  width: '8%' },
      { key: 'operator',         label: '操作人',       visible: true,  width: '8%' },
      { key: 'remarks',          label: '备注',         visible: true,  width: '32%' },
    ],
    headerText: '',
    footerText: '操作人签名: ________    审核人签名: ________    日期: ________',
    docInfo: '',
    bgOpacity: 0.06,
  };
}

function loadUsageTemplateConfig() {
  try {
    const stored = localStorage.getItem(USAGE_TEMPLATE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 合并默认值以兼容未来新增字段
      return Object.assign({}, getUsageDefaultTemplate(), parsed);
    }
  } catch (e) { /* ignore */ }
  return getUsageDefaultTemplate();
}

function saveUsageTemplateConfigToStorage(config) {
  localStorage.setItem(USAGE_TEMPLATE_STORAGE_KEY, JSON.stringify(config));
}

function openUsageTemplateConfig() {
  const tpl = loadUsageTemplateConfig();
  const modal = document.getElementById('usageTemplateConfigModal');
  document.getElementById('urTplOrgName').value = tpl.orgName || '';
  document.getElementById('urTplOrgSubtitle').value = tpl.orgSubtitle || '';
  document.getElementById('urTplTitle').value = tpl.title || '';
  document.getElementById('urTplDocInfo').value = tpl.docInfo || '';
  document.getElementById('urTplOrientation').value = tpl.orientation || 'portrait';
  document.getElementById('urTplFontSize').value = String(tpl.fontSize || 12);
  if (document.getElementById('urTplFontFamily')) {
    document.getElementById('urTplFontFamily').value = tpl.fontFamily || '楷体, KaiTi, 楷体_GB2312, STKaiti, serif';
  }
  if (document.getElementById('urTplBgOpacity')) {
    const opacity = typeof tpl.bgOpacity === 'number' ? tpl.bgOpacity : 0.06;
    // 找到最接近的选项值
    const sel = document.getElementById('urTplBgOpacity');
    const vals = [0, 0.03, 0.06, 0.10, 0.15, 0.20];
    let closest = vals[0], minDiff = Infinity;
    for (const v of vals) {
      const diff = Math.abs(v - opacity);
      if (diff < minDiff) { minDiff = diff; closest = v; }
    }
    sel.value = String(closest);
  }
  document.getElementById('urTplHeader').value = tpl.headerText || '';
  document.getElementById('urTplFooter').value = tpl.footerText || '';

  // 渲染列配置
  const colsList = document.getElementById('urTplColumnsList');
  colsList.innerHTML = tpl.columns.map((col, idx) => `
    <div class="tpl-col-row">
      <label class="tpl-col-check">
        <input type="checkbox" data-col-idx="${idx}" ${col.visible ? 'checked' : ''}>
        <span>${esc(col.label)}</span>
      </label>
      <input type="text" class="tpl-col-label-input" data-col-idx="${idx}" value="${esc(col.label)}" placeholder="列标题">
    </div>
  `).join('');

  modal.style.display = 'flex';
}

function saveUsageTemplateConfig() {
  const tpl = loadUsageTemplateConfig();
  tpl.orgName = document.getElementById('urTplOrgName').value.trim();
  tpl.orgSubtitle = document.getElementById('urTplOrgSubtitle').value.trim();
  tpl.title = document.getElementById('urTplTitle').value.trim() || '仪器设备使用登记表';
  tpl.docInfo = document.getElementById('urTplDocInfo').value.trim();
  tpl.orientation = document.getElementById('urTplOrientation').value;
  tpl.fontSize = parseInt(document.getElementById('urTplFontSize').value, 10) || 12;
  if (document.getElementById('urTplFontFamily')) {
    tpl.fontFamily = document.getElementById('urTplFontFamily').value;
  }
  if (document.getElementById('urTplBgOpacity')) {
    tpl.bgOpacity = parseFloat(document.getElementById('urTplBgOpacity').value) || 0;
  }
  tpl.headerText = document.getElementById('urTplHeader').value.trim();
  tpl.footerText = document.getElementById('urTplFooter').value.trim();

  // 校验：至少保留 1 列可见
  let visibleCount = 0;
  document.querySelectorAll('#urTplColumnsList .tpl-col-row').forEach((row, idx) => {
    if (tpl.columns[idx]) {
      const cb = row.querySelector('input[type="checkbox"]');
      const labelInput = row.querySelector('.tpl-col-label-input');
      tpl.columns[idx].visible = cb.checked;
      tpl.columns[idx].label = labelInput.value.trim() || tpl.columns[idx].label;
      if (cb.checked) visibleCount++;
    }
  });

  if (visibleCount === 0) {
    showToast('请至少选择一列显示', 'error');
    return;
  }

  saveUsageTemplateConfigToStorage(tpl);
  document.getElementById('usageTemplateConfigModal').style.display = 'none';
  showToast('打印模板已保存');
}

function resetUsageTemplateToDefault() {
  const tpl = getUsageDefaultTemplate();
  saveUsageTemplateConfigToStorage(tpl);
  openUsageTemplateConfig();
  showToast('模板已恢复为默认设置');
}

// ============================================
// 打印使用登记记录
// ============================================

async function printUsageRecords() {
  const term = document.getElementById('urSearchInput').value;
  const dateFrom = document.getElementById('urDateFrom').value;
  const dateTo = document.getElementById('urDateTo').value;

  if (dateFrom && dateTo && dateFrom > dateTo) {
    showToast('开始日期不能晚于结束日期', 'error');
    return;
  }

  // 重新请求当前筛选条件下的完整数据
  const params = new URLSearchParams();
  if (term) params.set('search', term.trim());
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  let url = '/equipment/usage';
  const qs = params.toString();
  if (qs) url += '?' + qs;

  try {
    const resp = await http.get(url);
    if (!resp || resp.code !== 200 || !resp.data || resp.data.length === 0) {
      showToast('没有可打印的数据', 'error');
      return;
    }
    buildUsagePrintWindow(resp.data, dateFrom, dateTo);
  } catch (err) {
    console.error('获取打印数据失败:', err);
    showToast('获取打印数据失败', 'error');
  }
}

function buildUsagePrintWindow(records, dateFrom, dateTo) {
  const tpl = loadUsageTemplateConfig();
  const visibleCols = tpl.columns.filter(c => c.visible);
  const user = getUser();
  const group = getGroup();

  // 格式化日期范围
  let dateRangeStr = '';
  if (dateFrom && dateTo) {
    dateRangeStr = `${dateFrom} 至 ${dateTo}`;
  } else if (dateFrom) {
    dateRangeStr = `${dateFrom} 起`;
  } else if (dateTo) {
    dateRangeStr = `截至 ${dateTo}`;
  } else {
    dateRangeStr = '全部日期';
  }

  const now = new Date().toLocaleString('zh-CN');
  const orientationStyle = tpl.orientation === 'landscape'
    ? '@page { size: A4 landscape; margin: 15mm; }'
    : '@page { size: A4 portrait; margin: 15mm; }';

  // 背景水印 — SVG pattern 平铺倾斜
  const bgOpacity = typeof tpl.bgOpacity === 'number' ? tpl.bgOpacity : 0.06;
  const bgSvg = (bgOpacity > 0)
    ? `<svg width="100%" height="100%" style="position:fixed;top:0;left:0;z-index:-1;pointer-events:none;" aria-hidden="true">
      <defs>
        <pattern id="watermark" width="540" height="90" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)">
          <image href="/images/logo.png" x="90" y="22" width="360" height="45" preserveAspectRatio="xMidYMid meet"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#watermark)" opacity="${bgOpacity}"/>
    </svg>`
    : '';

  // 字体
  const fontFamily = tpl.fontFamily || '楷体, KaiTi, 楷体_GB2312, STKaiti, serif';

  // 表头
  const headerCells = visibleCols.map(col =>
    `<th style="width:${col.width || 'auto'}">${esc(col.label)}</th>`
  ).join('');

  // 表格内容
  const bodyRows = records.map((item, idx) => {
    const cells = visibleCols.map(col => {
      let val = '';
      switch (col.key) {
        case 'row_num':          val = idx + 1; break;
        case 'usage_date':       val = item.usage_date ? new Date(item.usage_date).toLocaleDateString('zh-CN') : ''; break;
        case 'instrument_name':  val = item.instrument_name || ''; break;
        case 'instrument_model': val = item.instrument_model || ''; break;
        case 'sample_type':      val = item.sample_type || ''; break;
        case 'sample_count':     val = item.sample_count != null ? item.sample_count : ''; break;
        case 'operator':         val = item.operator || ''; break;
        case 'remarks':          val = item.remarks || ''; break;
        default: val = '';
      }
      return `<td>${esc(String(val))}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title></title>
  <style>
    ${orientationStyle}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontFamily};
      font-size: ${tpl.fontSize}px;
      color: #1f2937;
      padding: 24px 28px;
      position: relative;
      z-index: 0;
    }
    .print-org { text-align: center; margin-bottom: 2px; }
    .print-org .org-name { font-size: ${tpl.fontSize + 6}px; font-weight: 600; letter-spacing: 0.15em; font-family: ${fontFamily}; }
    .print-org .org-subtitle { font-size: ${tpl.fontSize - 1}px; color: #4b5563; margin-top: 2px; }
    .print-header { text-align: center; margin-bottom: 16px; margin-top: 12px; border-top: 2px solid #1f2937; border-bottom: 2px solid #1f2937; padding: 8px 0; }
    .print-header h2 { font-size: ${tpl.fontSize + 6}px; letter-spacing: 0.5em; font-weight: 700; }
    .print-header .meta { font-size: ${tpl.fontSize - 1}px; color: #6b7280; margin-top: 4px; }
    .print-header .header-text { margin-top: 4px; font-size: ${tpl.fontSize - 1}px; color: #374151; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    th, td { border: 1px solid #374151; padding: 6px 8px; text-align: center; }
    th { background-color: #e5e7eb; font-weight: 600; }
    td { text-align: left; }
    td:first-child, td:nth-child(2), td:nth-child(6) { text-align: center; }
    tr:nth-child(even) td { background-color: #fafafa; }
    .print-footer { margin-top: 20px; font-size: ${tpl.fontSize - 1}px; }
    .print-footer .footer-text { margin-top: 10px; white-space: pre-line; }
    .print-footer .meta-info { color: #9ca3af; margin-top: 6px; text-align: right; }
    @media print {
      body { padding: 0; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  ${bgSvg}
  <div class="print-org">
    <div class="org-name">${esc(tpl.orgName || '')}</div>
    ${tpl.orgSubtitle ? `<div class="org-subtitle">${esc(tpl.orgSubtitle)}</div>` : ''}
  </div>
  <div class="print-header">
    <h2>${esc(tpl.title)}</h2>
    <div class="meta">小组: ${esc(group?.name || '—')} &nbsp;|&nbsp; 日期范围: ${dateRangeStr} &nbsp;|&nbsp; 记录数: ${records.length} 条</div>
    <div class="meta">打印人: ${esc(user?.display_name || user?.username || '—')} &nbsp;|&nbsp; 打印时间: ${now}</div>
    ${tpl.headerText ? `<div class="header-text">${esc(tpl.headerText)}</div>` : ''}
  </div>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="print-footer">
    ${tpl.footerText ? `<div class="footer-text">${esc(tpl.footerText)}</div>` : ''}
    ${tpl.docInfo ? `<div class="doc-info" style="margin-top:6px;color:#6b7280;">${esc(tpl.docInfo)}</div>` : ''}
    <div class="meta-info">共 ${records.length} 条</div>
  </div>
  <script>
    window.onload = function() { window.print(); };
  <\/script>
</body>
</html>`;

  // 使用隐藏 iframe 打印，避免 "about:blank" 出现在打印预览头部
  removeWatermarkIframe();
  const iframe = document.createElement('iframe');
  iframe.id = '__print_iframe__';
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:99999;background:#fff;';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  // 打印完成后移除 iframe
  iframe.contentWindow.onafterprint = function () {
    removeWatermarkIframe();
  };
  // 兜底：用户取消打印也移除
  setTimeout(function () {
    if (document.getElementById('__print_iframe__')) {
      removeWatermarkIframe();
    }
  }, 60000);
}

// ============================================
// 维修记录 — CRUD
// ============================================

let repairInstrumentCache = [];

async function loadRepairRecords(searchTerm, dateFrom, dateTo) {
  const tbody = document.getElementById('repairTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#9ca3af;">加载中...</td></tr>';

  try {
    const params = new URLSearchParams();
    if (searchTerm && searchTerm.trim()) {
      params.set('search', searchTerm.trim());
    }
    if (dateFrom) {
      params.set('date_from', dateFrom);
    }
    if (dateTo) {
      params.set('date_to', dateTo);
    }
    let url = '/equipment/repair';
    const qs = params.toString();
    if (qs) url += '?' + qs;

    const resp = await http.get(url);
    if (!resp || resp.code !== 200) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
      return;
    }

    const data = resp.data || [];
    if (data.length === 0) {
      const msg = (searchTerm || dateFrom || dateTo) ? '未找到匹配的维修记录' : '暂无维修记录，点击「新增记录」添加';
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#9ca3af;">${msg}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(item => {
      const discStr = item.discovery_time ? new Date(item.discovery_time).toLocaleString('zh-CN') : '—';
      const handStr = item.handling_time ? new Date(item.handling_time).toLocaleString('zh-CN') : '—';
      const desc = item.fault_description ? (item.fault_description.length > 20 ? item.fault_description.slice(0, 20) + '...' : item.fault_description) : '—';
      return `
        <tr>
          <td><strong>${esc(item.instrument_name)}</strong><br><span style="font-size:12px;color:#9ca3af;">${esc(item.instrument_model || '')}</span></td>
          <td>${discStr}</td>
          <td>${esc(desc)}</td>
          <td>${esc(item.handler || '—')}</td>
          <td>${handStr}</td>
          <td>
            <button class="btn-icon" title="预览" onclick="openRepairDialog(${item.id},'view')"><i class="fa-solid fa-eye"></i></button>
            <button class="btn-icon" title="编辑" onclick="openRepairDialog(${item.id},'edit')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-icon delete" title="删除" onclick="deleteRepairRecord(${item.id},'${escJs(item.instrument_name)} ${discStr}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('加载维修记录列表失败:', err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
  }
}

async function loadRepairInstrumentOptions() {
  try {
    const resp = await http.get('/equipment/instruments');
    const selectEl = document.getElementById('editRpInstrumentId');
    if (!selectEl) return;
    if (resp && resp.code === 200 && resp.data.length > 0) {
      repairInstrumentCache = resp.data;
      selectEl.innerHTML = '<option value="">请选择仪器</option>' +
        resp.data.map(inst => `<option value="${inst.id}" data-model="${esc(inst.model)}">${esc(inst.name)} (${esc(inst.model)})</option>`).join('');
    } else {
      repairInstrumentCache = [];
      selectEl.innerHTML = '<option value="">无可用仪器</option>';
    }
  } catch (err) {
    console.error('加载仪器列表失败:', err);
  }
}

function onRepairInstrumentChange() {
  const selectEl = document.getElementById('editRpInstrumentId');
  const modelEl = document.getElementById('editRpModel');
  if (!selectEl || !modelEl) return;
  const opt = selectEl.selectedOptions[0];
  modelEl.value = (opt && opt.dataset.model) ? opt.dataset.model : '';
}

function onVerificationChange() {
  const val = document.getElementById('editRpNeedVerification').value;
  document.getElementById('verificationFields').style.display = (val === '是') ? '' : 'none';
}

function onTraceChange() {
  const val = document.getElementById('editRpNeedTrace').value;
  document.getElementById('traceFieldsYes').style.display = (val === '是') ? '' : 'none';
  document.getElementById('traceFieldsNo').style.display = (val === '否') ? '' : 'none';
}

async function openRepairDialog(id, mode) {
  const modal = document.getElementById('repairModal');
  const title = document.getElementById('repairModalTitle');
  const formFields = document.getElementById('repairFormFields');
  const readOnly = document.getElementById('repairReadOnly');
  const actionsAddEdit = document.getElementById('rpActionsAddEdit');
  const actionsView = document.getElementById('rpActionsView');
  const editId = document.getElementById('editRepairId');

  editId.value = '';

  if (mode === 'view') {
    title.textContent = '维修记录详情';
    formFields.style.display = 'none';
    readOnly.style.display = '';
    actionsAddEdit.style.display = 'none';
    actionsView.style.display = '';

    try {
      const resp = await http.get(`/equipment/repair/${id}`);
      if (!resp || resp.code !== 200) {
        showToast('加载维修记录详情失败', 'error');
        return;
      }
      renderRepairDetail(resp.data);
    } catch (err) {
      console.error('加载详情失败:', err);
      showToast('加载维修记录详情失败', 'error');
      return;
    }

  } else if (mode === 'edit') {
    title.textContent = '编辑维修记录';
    formFields.style.display = '';
    readOnly.style.display = 'none';
    actionsAddEdit.style.display = '';
    actionsView.style.display = 'none';
    editId.value = id;

    await loadRepairInstrumentOptions();

    try {
      const resp = await http.get(`/equipment/repair/${id}`);
      if (!resp || resp.code !== 200) {
        showToast('加载维修记录详情失败', 'error');
        return;
      }
      const d = resp.data;
      document.getElementById('editRpInstrumentId').value = d.instrument_id;
      const opt = document.querySelector(`#editRpInstrumentId option[value="${d.instrument_id}"]`);
      document.getElementById('editRpModel').value = opt ? opt.dataset.model : (d.instrument_model || '');
      document.getElementById('editRpDiscoverer').value = d.discoverer || '';
      document.getElementById('editRpDiscoveryTime').value = d.discovery_time ? d.discovery_time.replace('Z', '').slice(0, 16) : '';
      document.getElementById('editRpFaultDesc').value = d.fault_description || '';
      document.getElementById('editRpReplaced').value = d.replaced_after_fault || '';
      document.getElementById('editRpFaultCause').value = d.fault_cause_process || '';
      document.getElementById('editRpHandler').value = d.handler || '';
      document.getElementById('editRpHandlingTime').value = d.handling_time ? d.handling_time.replace('Z', '').slice(0, 16) : '';
      document.getElementById('editRpNeedVerification').value = d.need_performance_verification || '';
      onVerificationChange();
      document.getElementById('editRpVerificationMethod').value = d.verification_method || '';
      document.getElementById('editRpVerificationPerson').value = d.verification_person || '';
      document.getElementById('editRpVerificationDate').value = d.verification_date ? d.verification_date.slice(0, 10) : '';
      document.getElementById('editRpNeedTrace').value = d.need_trace_specimens || '';
      onTraceChange();
      document.getElementById('editRpTracedSituation').value = d.traced_situation || '';
      document.getElementById('editRpUntracedReason').value = d.untraced_reason || '';
      document.getElementById('editRpTraceHandler').value = d.trace_handler || '';
      document.getElementById('editRpTraceDate').value = d.trace_date ? d.trace_date.slice(0, 10) : '';
    } catch (err) {
      console.error('加载详情失败:', err);
      showToast('加载维修记录详情失败', 'error');
      return;
    }

  } else {
    title.textContent = '新增维修记录';
    formFields.style.display = '';
    readOnly.style.display = 'none';
    actionsAddEdit.style.display = '';
    actionsView.style.display = 'none';
    editId.value = '';

    await loadRepairInstrumentOptions();
    document.getElementById('editRpInstrumentId').value = '';
    document.getElementById('editRpModel').value = '';
    document.getElementById('editRpDiscoverer').value = '';
    document.getElementById('editRpDiscoveryTime').value = '';
    document.getElementById('editRpFaultDesc').value = '';
    document.getElementById('editRpReplaced').value = '';
    document.getElementById('editRpFaultCause').value = '';
    document.getElementById('editRpHandler').value = '';
    document.getElementById('editRpHandlingTime').value = '';
    document.getElementById('editRpNeedVerification').value = '';
    document.getElementById('verificationFields').style.display = 'none';
    document.getElementById('editRpVerificationMethod').value = '';
    document.getElementById('editRpVerificationPerson').value = '';
    document.getElementById('editRpVerificationDate').value = '';
    document.getElementById('editRpNeedTrace').value = '';
    document.getElementById('traceFieldsYes').style.display = 'none';
    document.getElementById('traceFieldsNo').style.display = 'none';
    document.getElementById('editRpTracedSituation').value = '';
    document.getElementById('editRpUntracedReason').value = '';
    document.getElementById('editRpTraceHandler').value = '';
    document.getElementById('editRpTraceDate').value = '';
  }

  modal.style.display = 'flex';
}

function closeRepairDialog() {
  document.getElementById('repairModal').style.display = 'none';
}

function renderRepairDetail(data) {
  const instLabel = (data.instrument_name || '—') + ' (' + (data.instrument_model || '—') + ')';

  // Section 1: 故障发现
  const sec1 = `
    <fieldset class="rp-card">
      <legend class="rp-legend">一、故障发现</legend>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">仪器</span><div class="detail-value">${esc(instLabel)}</div></div>
        <div class="detail-item"><span class="detail-label">发现人</span><div class="detail-value">${esc(data.discoverer || '—')}</div></div>
        <div class="detail-item"><span class="detail-label">发现时间</span><div class="detail-value">${data.discovery_time ? new Date(data.discovery_time).toLocaleString('zh-CN') : '—'}</div></div>
        <div class="detail-item"><span class="detail-label">是否更换停用</span><div class="detail-value">${esc(data.replaced_after_fault || '—')}</div></div>
        <div class="detail-item full"><span class="detail-label">故障现象描述</span><div class="detail-value">${esc(data.fault_description || '—')}</div></div>
      </div>
    </fieldset>
  `;

  // Section 2: 故障处理
  const sec2 = `
    <fieldset class="rp-card">
      <legend class="rp-legend">二、故障处理</legend>
      <div class="detail-grid">
        <div class="detail-item full"><span class="detail-label">故障原因及处理过程</span><div class="detail-value">${esc(data.fault_cause_process || '—')}</div></div>
        <div class="detail-item"><span class="detail-label">处理人</span><div class="detail-value">${esc(data.handler || '—')}</div></div>
        <div class="detail-item"><span class="detail-label">处理时间</span><div class="detail-value">${data.handling_time ? new Date(data.handling_time).toLocaleString('zh-CN') : '—'}</div></div>
      </div>
    </fieldset>
  `;

  // Section 3: 性能验证
  const verExtra = data.need_performance_verification === '是' ? `
    <div class="detail-item"><span class="detail-label">验证方式</span><div class="detail-value">${esc(data.verification_method || '—')}</div></div>
    <div class="detail-item"><span class="detail-label">性能验证人</span><div class="detail-value">${esc(data.verification_person || '—')}</div></div>
    <div class="detail-item"><span class="detail-label">性能验证日期</span><div class="detail-value">${data.verification_date ? new Date(data.verification_date).toLocaleDateString('zh-CN') : '—'}</div></div>
  ` : '';
  const sec3 = `
    <fieldset class="rp-card">
      <legend class="rp-legend">三、性能验证</legend>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">是否需性能验证</span><div class="detail-value">${esc(data.need_performance_verification || '—')}</div></div>
        ${verExtra}
      </div>
    </fieldset>
  `;

  // Section 4: 追溯
  let traceExtra = '';
  if (data.need_trace_specimens === '是') {
    traceExtra = `<div class="detail-item full"><span class="detail-label">已追溯的情况</span><div class="detail-value">${esc(data.traced_situation || '—')}</div></div>`;
  } else if (data.need_trace_specimens === '否') {
    traceExtra = `<div class="detail-item full"><span class="detail-label">未追溯的理由</span><div class="detail-value">${esc(data.untraced_reason || '—')}</div></div>`;
  }
  const sec4 = `
    <fieldset class="rp-card">
      <legend class="rp-legend">四、追溯故障前标本</legend>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">是否追溯</span><div class="detail-value">${esc(data.need_trace_specimens || '—')}</div></div>
        ${traceExtra}
        <div class="detail-item"><span class="detail-label">追溯处理人</span><div class="detail-value">${esc(data.trace_handler || '—')}</div></div>
        <div class="detail-item"><span class="detail-label">追溯日期</span><div class="detail-value">${data.trace_date ? new Date(data.trace_date).toLocaleDateString('zh-CN') : '—'}</div></div>
      </div>
    </fieldset>
  `;

  const metaHtml = `
    <div class="detail-grid" style="margin-top:12px;">
      <div class="detail-item"><span class="detail-label">创建时间</span><div class="detail-value">${data.created_at ? new Date(data.created_at).toLocaleString('zh-CN') : '—'}</div></div>
      <div class="detail-item"><span class="detail-label">最后更新</span><div class="detail-value">${data.updated_at ? new Date(data.updated_at).toLocaleString('zh-CN') : '—'}</div></div>
    </div>
  `;

  document.getElementById('repairDetailContent').innerHTML =
    '<div class="rp-view-grid">' + sec1 + sec2 + sec3 + sec4 + '</div>' + metaHtml;
}

async function saveRepairRecord() {
  const id = document.getElementById('editRepairId').value;

  const payload = {
    instrument_id: parseInt(document.getElementById('editRpInstrumentId').value, 10) || null,
    discoverer: document.getElementById('editRpDiscoverer').value.trim(),
    discovery_time: document.getElementById('editRpDiscoveryTime').value ? document.getElementById('editRpDiscoveryTime').value + ':00' : null,
    fault_description: document.getElementById('editRpFaultDesc').value.trim(),
    replaced_after_fault: document.getElementById('editRpReplaced').value,
    fault_cause_process: document.getElementById('editRpFaultCause').value.trim(),
    handler: document.getElementById('editRpHandler').value.trim(),
    handling_time: document.getElementById('editRpHandlingTime').value ? document.getElementById('editRpHandlingTime').value + ':00' : null,
    need_performance_verification: document.getElementById('editRpNeedVerification').value,
    verification_method: document.getElementById('editRpVerificationMethod').value.trim(),
    verification_person: document.getElementById('editRpVerificationPerson').value.trim(),
    verification_date: document.getElementById('editRpVerificationDate').value,
    need_trace_specimens: document.getElementById('editRpNeedTrace').value,
    traced_situation: document.getElementById('editRpTracedSituation').value.trim(),
    untraced_reason: document.getElementById('editRpUntracedReason').value.trim(),
    trace_handler: document.getElementById('editRpTraceHandler').value.trim(),
    trace_date: document.getElementById('editRpTraceDate').value,
  };

  if (!payload.instrument_id) { showToast('请选择仪器', 'error'); return; }
  if (!payload.discoverer) { showToast('发现人不能为空', 'error'); return; }

  try {
    let resp;
    if (id) {
      resp = await http.put(`/equipment/repair/${id}`, payload);
    } else {
      resp = await http.post('/equipment/repair', payload);
    }

    if (resp && resp.code === 200) {
      showToast(id ? '维修记录更新成功' : '维修记录添加成功');
      closeRepairDialog();
      doRepairSearch();
    } else {
      showToast(resp?.message || '保存失败', 'error');
    }
  } catch (err) {
    console.error('保存维修记录失败:', err);
    showToast('保存失败: ' + (err.message || '网络错误'), 'error');
  }
}

function deleteRepairRecord(id, desc) {
  showModal('确认删除', `<p>确定要删除维修记录 <strong>${esc(desc)}</strong> 吗？此操作不可恢复。</p>`, async (overlay) => {
    try {
      const resp = await http.del(`/equipment/repair/${id}`);
      if (resp && resp.code === 200) {
        showToast('维修记录已删除');
        overlay.remove();
        doRepairSearch();
      } else {
        showToast(resp?.message || '删除失败', 'error');
      }
    } catch (err) {
      console.error('删除维修记录失败:', err);
      showToast('删除失败: ' + (err.message || '网络错误'), 'error');
    }
  });
}

function doRepairSearch() {
  const term = document.getElementById('rpSearchInput').value;
  const dateFrom = document.getElementById('rpDateFrom').value;
  const dateTo = document.getElementById('rpDateTo').value;
  loadRepairRecords(term, dateFrom, dateTo);
}

function clearRepairSearch() {
  document.getElementById('rpSearchInput').value = '';
  document.getElementById('rpDateFrom').value = '';
  document.getElementById('rpDateTo').value = '';
  loadRepairRecords();
}

// ============================================
// 维修记录 — 打印模板配置
// ============================================

const REPAIR_TEMPLATE_STORAGE_KEY = 'repair_print_template_v1';

function getRepairDefaultTemplate() {
  return {
    title: '仪器设备维修记录表',
    orgName: '中国医学科学院血液病医院精准医学诊断中心',
    orgSubtitle: '（天津市静海区团泊大道 28 号）',
    orientation: 'portrait',
    fontSize: 12,
    fontFamily: '楷体, KaiTi, 楷体_GB2312, STKaiti, serif',
    columns: [
      { key: 'row_num',                     label: '序号',         visible: true,  width: '5%' },
      { key: 'instrument_name',             label: '仪器名称',     visible: true,  width: '10%' },
      { key: 'instrument_model',            label: '仪器型号',     visible: true,  width: '8%' },
      { key: 'discovery_time',              label: '发现时间',     visible: true,  width: '11%' },
      { key: 'fault_description',           label: '故障描述',     visible: true,  width: '15%' },
      { key: 'handler',                     label: '处理人',       visible: true,  width: '7%' },
      { key: 'handling_time',               label: '处理时间',     visible: true,  width: '11%' },
      { key: 'need_performance_verification',label: '是否需性能验证', visible: true,  width: '8%' },
      { key: 'verification_date',           label: '验证日期',     visible: true,  width: '9%' },
      { key: 'need_trace_specimens',        label: '是否追溯标本', visible: true,  width: '8%' },
      { key: 'trace_date',                  label: '追溯日期',     visible: true,  width: '8%' },
    ],
    headerText: '',
    footerText: '处理人签名: ________    审核人签名: ________    日期: ________',
    docInfo: '',
    bgOpacity: 0.06,
  };
}

function loadRepairTemplateConfig() {
  try {
    const stored = localStorage.getItem(REPAIR_TEMPLATE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return Object.assign({}, getRepairDefaultTemplate(), parsed);
    }
  } catch (e) { /* ignore */ }
  return getRepairDefaultTemplate();
}

function saveRepairTemplateConfigToStorage(config) {
  localStorage.setItem(REPAIR_TEMPLATE_STORAGE_KEY, JSON.stringify(config));
}

function openRepairTemplateConfig() {
  const tpl = loadRepairTemplateConfig();
  const modal = document.getElementById('repairTemplateConfigModal');
  document.getElementById('rpTplOrgName').value = tpl.orgName || '';
  document.getElementById('rpTplOrgSubtitle').value = tpl.orgSubtitle || '';
  document.getElementById('rpTplTitle').value = tpl.title || '';
  document.getElementById('rpTplDocInfo').value = tpl.docInfo || '';
  document.getElementById('rpTplOrientation').value = tpl.orientation || 'portrait';
  document.getElementById('rpTplFontSize').value = String(tpl.fontSize || 12);
  if (document.getElementById('rpTplFontFamily')) {
    document.getElementById('rpTplFontFamily').value = tpl.fontFamily || '楷体, KaiTi, 楷体_GB2312, STKaiti, serif';
  }
  if (document.getElementById('rpTplBgOpacity')) {
    const opacity = typeof tpl.bgOpacity === 'number' ? tpl.bgOpacity : 0.06;
    const sel = document.getElementById('rpTplBgOpacity');
    const vals = [0, 0.03, 0.06, 0.10, 0.15, 0.20];
    let closest = vals[0], minDiff = Infinity;
    for (const v of vals) {
      const diff = Math.abs(v - opacity);
      if (diff < minDiff) { minDiff = diff; closest = v; }
    }
    sel.value = String(closest);
  }
  document.getElementById('rpTplHeader').value = tpl.headerText || '';
  document.getElementById('rpTplFooter').value = tpl.footerText || '';

  // 渲染列配置
  const colsList = document.getElementById('rpTplColumnsList');
  colsList.innerHTML = tpl.columns.map((col, idx) => `
    <div class="tpl-col-row">
      <label class="tpl-col-check">
        <input type="checkbox" data-col-idx="${idx}" ${col.visible ? 'checked' : ''}>
        <span>${esc(col.label)}</span>
      </label>
      <input type="text" class="tpl-col-label-input" data-col-idx="${idx}" value="${esc(col.label)}" placeholder="列标题">
    </div>
  `).join('');

  modal.style.display = 'flex';
}

function saveRepairTemplateConfig() {
  const tpl = loadRepairTemplateConfig();
  tpl.orgName = document.getElementById('rpTplOrgName').value.trim();
  tpl.orgSubtitle = document.getElementById('rpTplOrgSubtitle').value.trim();
  tpl.title = document.getElementById('rpTplTitle').value.trim() || '仪器设备维修记录表';
  tpl.docInfo = document.getElementById('rpTplDocInfo').value.trim();
  tpl.orientation = document.getElementById('rpTplOrientation').value;
  tpl.fontSize = parseInt(document.getElementById('rpTplFontSize').value, 10) || 12;
  if (document.getElementById('rpTplFontFamily')) {
    tpl.fontFamily = document.getElementById('rpTplFontFamily').value;
  }
  if (document.getElementById('rpTplBgOpacity')) {
    tpl.bgOpacity = parseFloat(document.getElementById('rpTplBgOpacity').value) || 0;
  }
  tpl.headerText = document.getElementById('rpTplHeader').value.trim();
  tpl.footerText = document.getElementById('rpTplFooter').value.trim();

  // 校验：至少保留 1 列可见
  let visibleCount = 0;
  document.querySelectorAll('#rpTplColumnsList .tpl-col-row').forEach((row, idx) => {
    if (tpl.columns[idx]) {
      const cb = row.querySelector('input[type="checkbox"]');
      const labelInput = row.querySelector('.tpl-col-label-input');
      tpl.columns[idx].visible = cb.checked;
      tpl.columns[idx].label = labelInput.value.trim() || tpl.columns[idx].label;
      if (cb.checked) visibleCount++;
    }
  });

  if (visibleCount === 0) {
    showToast('请至少选择一列显示', 'error');
    return;
  }

  saveRepairTemplateConfigToStorage(tpl);
  document.getElementById('repairTemplateConfigModal').style.display = 'none';
  showToast('打印模板已保存');
}

function resetRepairTemplateToDefault() {
  const tpl = getRepairDefaultTemplate();
  saveRepairTemplateConfigToStorage(tpl);
  openRepairTemplateConfig();
  showToast('模板已恢复为默认设置');
}

// ============================================
// 维修记录 — 打印
// ============================================

async function printRepairRecords() {
  const term = document.getElementById('rpSearchInput').value;
  const dateFrom = document.getElementById('rpDateFrom').value;
  const dateTo = document.getElementById('rpDateTo').value;

  if (dateFrom && dateTo && dateFrom > dateTo) {
    showToast('开始日期不能晚于结束日期', 'error');
    return;
  }

  // 重新请求当前筛选条件下的完整数据
  const params = new URLSearchParams();
  if (term) params.set('search', term.trim());
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  let url = '/equipment/repair';
  const qs = params.toString();
  if (qs) url += '?' + qs;

  try {
    const resp = await http.get(url);
    if (!resp || resp.code !== 200 || !resp.data || resp.data.length === 0) {
      showToast('没有可打印的数据', 'error');
      return;
    }
    buildRepairPrintWindow(resp.data, dateFrom, dateTo);
  } catch (err) {
    console.error('获取打印数据失败:', err);
    showToast('获取打印数据失败', 'error');
  }
}

function buildRepairPrintWindow(records, dateFrom, dateTo) {
  const tpl = loadRepairTemplateConfig();
  const visibleCols = tpl.columns.filter(c => c.visible);
  const user = getUser();
  const group = getGroup();

  // 格式化日期范围
  let dateRangeStr = '';
  if (dateFrom && dateTo) {
    dateRangeStr = `${dateFrom} 至 ${dateTo}`;
  } else if (dateFrom) {
    dateRangeStr = `${dateFrom} 起`;
  } else if (dateTo) {
    dateRangeStr = `截至 ${dateTo}`;
  } else {
    dateRangeStr = '全部日期';
  }

  const now = new Date().toLocaleString('zh-CN');
  const orientationStyle = tpl.orientation === 'landscape'
    ? '@page { size: A4 landscape; margin: 15mm; }'
    : '@page { size: A4 portrait; margin: 15mm; }';

  // 背景水印 — SVG pattern 平铺倾斜
  const bgOpacity = typeof tpl.bgOpacity === 'number' ? tpl.bgOpacity : 0.06;
  const bgSvg = (bgOpacity > 0)
    ? `<svg width="100%" height="100%" style="position:fixed;top:0;left:0;z-index:-1;pointer-events:none;" aria-hidden="true">
      <defs>
        <pattern id="watermark" width="540" height="90" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)">
          <image href="/images/logo.png" x="90" y="22" width="360" height="45" preserveAspectRatio="xMidYMid meet"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#watermark)" opacity="${bgOpacity}"/>
    </svg>`
    : '';

  // 字体
  const fontFamily = tpl.fontFamily || '楷体, KaiTi, 楷体_GB2312, STKaiti, serif';

  // 表头
  const headerCells = visibleCols.map(col =>
    `<th style="width:${col.width || 'auto'}">${esc(col.label)}</th>`
  ).join('');

  // 表格内容
  const bodyRows = records.map((item, idx) => {
    const cells = visibleCols.map(col => {
      let val = '';
      switch (col.key) {
        case 'row_num':                     val = idx + 1; break;
        case 'instrument_name':             val = item.instrument_name || ''; break;
        case 'instrument_model':            val = item.instrument_model || ''; break;
        case 'discovery_time':              val = item.discovery_time ? new Date(item.discovery_time).toLocaleString('zh-CN') : ''; break;
        case 'fault_description':           val = item.fault_description || ''; break;
        case 'handler':                     val = item.handler || ''; break;
        case 'handling_time':               val = item.handling_time ? new Date(item.handling_time).toLocaleString('zh-CN') : ''; break;
        case 'need_performance_verification': val = item.need_performance_verification || ''; break;
        case 'verification_date':           val = item.verification_date ? new Date(item.verification_date).toLocaleDateString('zh-CN') : ''; break;
        case 'need_trace_specimens':        val = item.need_trace_specimens || ''; break;
        case 'trace_date':                  val = item.trace_date ? new Date(item.trace_date).toLocaleDateString('zh-CN') : ''; break;
        default: val = '';
      }
      return `<td>${esc(String(val))}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title></title>
  <style>
    ${orientationStyle}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontFamily};
      font-size: ${tpl.fontSize}px;
      color: #1f2937;
      padding: 24px 28px;
      position: relative;
      z-index: 0;
    }
    .print-org { text-align: center; margin-bottom: 2px; }
    .print-org .org-name { font-size: ${tpl.fontSize + 6}px; font-weight: 600; letter-spacing: 0.15em; font-family: ${fontFamily}; }
    .print-org .org-subtitle { font-size: ${tpl.fontSize - 1}px; color: #4b5563; margin-top: 2px; }
    .print-header { text-align: center; margin-bottom: 16px; margin-top: 12px; border-top: 2px solid #1f2937; border-bottom: 2px solid #1f2937; padding: 8px 0; }
    .print-header h2 { font-size: ${tpl.fontSize + 6}px; letter-spacing: 0.5em; font-weight: 700; }
    .print-header .meta { font-size: ${tpl.fontSize - 1}px; color: #6b7280; margin-top: 4px; }
    .print-header .header-text { margin-top: 4px; font-size: ${tpl.fontSize - 1}px; color: #374151; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    th, td { border: 1px solid #374151; padding: 6px 8px; text-align: center; }
    th { background-color: #e5e7eb; font-weight: 600; }
    td { text-align: left; }
    td:first-child, td:nth-child(4), td:nth-child(6) { text-align: center; }
    tr:nth-child(even) td { background-color: #fafafa; }
    .print-footer { margin-top: 20px; font-size: ${tpl.fontSize - 1}px; }
    .print-footer .footer-text { margin-top: 10px; white-space: pre-line; }
    .print-footer .meta-info { color: #9ca3af; margin-top: 6px; text-align: right; }
    @media print {
      body { padding: 0; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  ${bgSvg}
  <div class="print-org">
    <div class="org-name">${esc(tpl.orgName || '')}</div>
    ${tpl.orgSubtitle ? `<div class="org-subtitle">${esc(tpl.orgSubtitle)}</div>` : ''}
  </div>
  <div class="print-header">
    <h2>${esc(tpl.title)}</h2>
    <div class="meta">小组: ${esc(group?.name || '—')} &nbsp;|&nbsp; 日期范围: ${dateRangeStr} &nbsp;|&nbsp; 记录数: ${records.length} 条</div>
    <div class="meta">打印人: ${esc(user?.display_name || user?.username || '—')} &nbsp;|&nbsp; 打印时间: ${now}</div>
    ${tpl.headerText ? `<div class="header-text">${esc(tpl.headerText)}</div>` : ''}
  </div>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="print-footer">
    ${tpl.footerText ? `<div class="footer-text">${esc(tpl.footerText)}</div>` : ''}
    ${tpl.docInfo ? `<div class="doc-info" style="margin-top:6px;color:#6b7280;">${esc(tpl.docInfo)}</div>` : ''}
    <div class="meta-info">共 ${records.length} 条</div>
  </div>
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;

  // 使用隐藏 iframe 打印
  removeWatermarkIframe();
  const iframe = document.createElement('iframe');
  iframe.id = '__print_iframe__';
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:99999;background:#fff;';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  // 打印完成后移除 iframe
  iframe.contentWindow.onafterprint = function () {
    removeWatermarkIframe();
  };
  // 兜底：用户取消打印也移除
  setTimeout(function () {
    if (document.getElementById('__print_iframe__')) {
      removeWatermarkIframe();
    }
  }, 60000);
}

// ============================================
// 仪器校准报告 CRUD
// ============================================

let currentCalFiles = [];  // 当前编辑中的文件数组 [{name, type, size, data}]

// 加载校准报告列表
async function loadCalibrationRecords(searchTerm) {
  try {
    let url = '/equipment/calibration';
    if (searchTerm && searchTerm.trim()) {
      url += `?search=${encodeURIComponent(searchTerm.trim())}`;
    }
    const resp = await http.get(url);
    const tbody = document.getElementById('calibrationTableBody');
    if (!resp || resp.code !== 200 || !resp.data || resp.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">暂无校准报告，点击「新增报告」添加</td></tr>';
      return;
    }

    tbody.innerHTML = resp.data.map(r => {
      const reportDate = r.report_date ? new Date(r.report_date).toLocaleDateString('zh-CN') : '';
      const fileNamesHtml = r.file_names && r.file_names.length > 0
        ? r.file_names.map((fn, i) => `<span style="cursor:pointer;color:var(--primary);" title="点击预览" onclick="previewCalibrationFileDirect(${r.id}, ${i})">${esc(fn)}</span>`).join('<br>')
        : '-';
      return `<tr>
        <td>${esc(r.instrument_name || '')}</td>
        <td>${esc(r.instrument_model || '')}</td>
        <td>${esc(r.uploader || '')}</td>
        <td>${reportDate}</td>
        <td style="font-size:13px;">${fileNamesHtml}${r.file_count > 0 ? ' <span style="color:#9ca3af;">('+r.file_count+'个)</span>' : ''}</td>
        <td>
          <button class="btn-icon" title="查看" onclick="openCalibrationDialog(${r.id},'view')"><i class="fa-solid fa-eye"></i></button>
          <button class="btn-icon" title="编辑" onclick="openCalibrationDialog(${r.id},'edit')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon delete" title="删除" onclick="deleteCalibrationRecord(${r.id},'${escJs(r.instrument_name)} ${reportDate}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error('加载校准报告列表失败:', err);
    document.getElementById('calibrationTableBody').innerHTML = '<tr><td colspan="6" class="table-empty">加载失败，请重试</td></tr>';
  }
}

// 填充仪器下拉选项（校准报告用）
async function loadCalibrationInstrumentOptions() {
  try {
    const resp = await http.get('/equipment/instruments');
    if (!resp || resp.code !== 200 || !resp.data) return;
    const select = document.getElementById('editCfInstrumentId');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">请选择仪器</option>' +
      resp.data.map(inst => `<option value="${inst.id}" data-model="${esc(inst.model || '')}">${esc(inst.name || '')} (${esc(inst.serial_number || '')})</option>`).join('');
    select.value = currentVal;
  } catch (err) {
    console.error('加载仪器下拉失败:', err);
  }
}

// 仪器变更时同步型号
function onCalibrationInstrumentChange() {
  const select = document.getElementById('editCfInstrumentId');
  const modelInput = document.getElementById('editCfModel');
  if (!select || !modelInput) return;
  const selectedOption = select.options[select.selectedIndex];
  if (selectedOption && selectedOption.dataset.model) {
    modelInput.value = selectedOption.dataset.model;
  } else {
    modelInput.value = '';
  }
}

// 处理文件选择 → Base64
function handleCalibrationFiles(input) {
  if (!input.files || input.files.length === 0) return;

  const ALLOWED_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  const files = Array.from(input.files);
  let processed = 0;
  let skipped = 0;

  files.forEach(file => {
    const mime = file.type || '';
    const isImage = mime.startsWith('image/');
    const isAllowed = ALLOWED_TYPES.includes(mime) || isImage;

    if (!isAllowed) {
      skipped++;
      if (processed + skipped === files.length && processed === 0) {
        // 所有文件都被拒绝
        // do nothing, alert below
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      currentCalFiles.push({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        data: e.target.result.split(',')[1] // 只取 base64 数据部分，去掉 "data:xxx;base64," 前缀
      });
      processed++;
      if (processed + skipped === files.length) {
        renderCalFileList();
        if (skipped > 0) {
          showToast(`${skipped} 个文件格式不支持已跳过，仅允许 PDF/Word/图片`, 'warning');
        }
      }
    };
    reader.readAsDataURL(file);
  });

  // 重置 input 以便重复选择同一文件
  input.value = '';
}

// 渲染文件列表
function renderCalFileList() {
  const container = document.getElementById('cfFileList');
  const countSpan = document.getElementById('cfFileCount');
  if (!container || !countSpan) return;

  if (currentCalFiles.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    countSpan.textContent = '未选择文件';
    return;
  }

  container.style.display = 'block';
  countSpan.textContent = `已选择 ${currentCalFiles.length} 个文件`;

  container.innerHTML = currentCalFiles.map((f, i) => {
    const iconHtml = getFileIconHtml(f.type, f.name);
    const sizeStr = formatFileSize(f.size);
    return `<div class="cf-file-item">
      <span class="cf-file-icon">${iconHtml}</span>
      <span class="cf-file-info">
        <span class="cf-file-name" onclick="previewCalibrationFile(currentCalFiles[${i}])" title="点击预览">${esc(f.name)}</span>
        <span class="cf-file-size">${sizeStr}</span>
      </span>
      <span class="cf-file-actions">
        <button class="cf-btn-preview" title="预览" onclick="previewCalibrationFile(currentCalFiles[${i}])"><i class="fa-solid fa-magnifying-glass"></i></button>
        <button class="cf-btn-remove" title="移除" onclick="removeCalibrationFile(${i})"><i class="fa-solid fa-xmark"></i></button>
      </span>
    </div>`;
  }).join('');
}

// 根据 MIME 类型返回图标 HTML
function getFileIconHtml(mime, name) {
  if (mime.startsWith('image/')) return '<i class="fa-solid fa-image"></i>';
  if (mime === 'application/pdf') return '<i class="fa-solid fa-file-pdf"></i>';
  if (mime.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return '<i class="fa-solid fa-file-word"></i>';
  return '<i class="fa-solid fa-file"></i>';
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 移除单个文件
function removeCalibrationFile(index) {
  currentCalFiles.splice(index, 1);
  renderCalFileList();
}

// 从列表直接预览文件（先获取详情再预览指定文件）
async function previewCalibrationFileDirect(id, fileIndex) {
  try {
    const resp = await http.get(`/equipment/calibration/${id}`);
    if (!resp || resp.code !== 200 || !resp.data) {
      showToast('获取文件失败', 'error');
      return;
    }
    const files = resp.data.files;
    if (!files || !files[fileIndex]) {
      showToast('文件不存在', 'error');
      return;
    }
    previewCalibrationFile(files[fileIndex]);
  } catch (err) {
    console.error('预览文件失败:', err);
    showToast('预览失败: ' + (err.message || '网络错误'), 'error');
  }
}

// 预览文件
function previewCalibrationFile(file) {
  if (!file || !file.data) return;
  const mime = file.type || '';
  const dataUrl = `data:${mime};base64,${file.data}`;

  if (mime.startsWith('image/')) {
    // 图片：弹层预览
    const overlay = document.createElement('div');
    overlay.className = 'cf-preview-overlay';
    overlay.innerHTML = `<div class="cf-preview-box">
      <button class="cf-preview-close" onclick="this.closest('.cf-preview-overlay').remove()">&times;</button>
      <img src="${dataUrl}" alt="${esc(file.name)}">
    </div>`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  } else if (mime === 'application/pdf') {
    // PDF：新窗口打开
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(`<html><head><title>${esc(file.name)}</title></head><body style="margin:0;"><iframe src="${dataUrl}" width="100%" height="100%" style="border:none;"></iframe></body></html>`);
    }
  } else {
    // Word 等：尝试新窗口打开
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(`<html><head><title>${esc(file.name)}</title></head><body style="margin:0;"><iframe src="${dataUrl}" width="100%" height="100%" style="border:none;"></iframe></body></html>`);
    }
  }
}

// 打开校准报告弹窗
async function openCalibrationDialog(id, mode) {
  const modal = document.getElementById('calibrationModal');
  const title = document.getElementById('calibrationModalTitle');
  const formFields = document.getElementById('calibrationFormFields');
  const readOnly = document.getElementById('calibrationReadOnly');
  const actionsAddEdit = document.getElementById('cfActionsAddEdit');
  const actionsView = document.getElementById('cfActionsView');

  // 重置状态
  currentCalFiles = [];
  document.getElementById('editCalibrationId').value = '';
  document.getElementById('editCfInstrumentId').value = '';
  document.getElementById('editCfModel').value = '';
  document.getElementById('editCfUploader').value = '';
  document.getElementById('editCfReportDate').value = '';
  document.getElementById('cfFileList').style.display = 'none';
  document.getElementById('cfFileList').innerHTML = '';
  document.getElementById('cfFileCount').textContent = '未选择文件';

  // 加载仪器下拉
  await loadCalibrationInstrumentOptions();

  if (mode === 'add') {
    title.textContent = '新增校准报告';
    formFields.style.display = '';
    readOnly.style.display = 'none';
    actionsAddEdit.style.display = '';
    actionsView.style.display = 'none';
    modal.style.display = 'flex';
  } else {
    // view 或 edit 模式，先获取详情
    try {
      const resp = await http.get(`/equipment/calibration/${id}`);
      if (!resp || resp.code !== 200 || !resp.data) {
        showToast('获取校准报告详情失败', 'error');
        return;
      }
      const d = resp.data;

      if (mode === 'edit') {
        title.textContent = '编辑校准报告';
        formFields.style.display = '';
        readOnly.style.display = 'none';
        actionsAddEdit.style.display = '';
        actionsView.style.display = 'none';

        document.getElementById('editCalibrationId').value = d.id;
        document.getElementById('editCfInstrumentId').value = d.instrument_id;
        onCalibrationInstrumentChange();
        document.getElementById('editCfUploader').value = d.uploader || '';
        document.getElementById('editCfReportDate').value = d.report_date ? d.report_date.slice(0, 10) : '';

        // 加载已有文件（含 data）
        if (d.files && Array.isArray(d.files)) {
          currentCalFiles = d.files;
        }
        renderCalFileList();

      } else {
        // view
        title.textContent = '校准报告详情';
        formFields.style.display = 'none';
        readOnly.style.display = '';
        actionsAddEdit.style.display = 'none';
        actionsView.style.display = '';
        renderCalibrationDetail(d);
      }

      modal.style.display = 'flex';
    } catch (err) {
      console.error('获取校准报告详情失败:', err);
      showToast('获取校准报告详情失败: ' + (err.message || '网络错误'), 'error');
    }
  }
}

// 关闭弹窗
function closeCalibrationDialog() {
  document.getElementById('calibrationModal').style.display = 'none';
  currentCalFiles = [];
}

// 渲染校准报告详情（查看模式）
function renderCalibrationDetail(data) {
  const container = document.getElementById('calibrationDetailContent');
  const reportDate = data.report_date ? new Date(data.report_date).toLocaleDateString('zh-CN') : '';

  let filesHtml = '<span style="color:#9ca3af;font-style:italic;">无文件</span>';
  if (data.files && Array.isArray(data.files) && data.files.length > 0) {
    filesHtml = data.files.map((f, i) => {
      const iconHtml = getFileIconHtml(f.type, f.name);
      const sizeStr = formatFileSize(f.size);
      return `<div class="cf-file-item" style="background:var(--bg);margin-bottom:4px;border-radius:6px;">
        <span class="cf-file-icon">${iconHtml}</span>
        <span class="cf-file-info">
          <span class="cf-file-name" onclick="previewCalibrationFile(currentCalFiles[${i}])" title="点击预览">${esc(f.name)}</span>
          <span class="cf-file-size">${sizeStr}</span>
        </span>
      </div>`;
    }).join('');
    // 把文件数据暂存以便预览
    currentCalFiles = data.files;
  }

  container.innerHTML = `<div class="cf-detail-grid">
    <div class="cf-detail-item">
      <span class="cf-detail-label">仪器名称</span>
      <span class="cf-detail-value">${esc(data.instrument_name || '')}</span>
    </div>
    <div class="cf-detail-item">
      <span class="cf-detail-label">仪器型号</span>
      <span class="cf-detail-value">${esc(data.instrument_model || '')}</span>
    </div>
    <div class="cf-detail-item">
      <span class="cf-detail-label">上传人</span>
      <span class="cf-detail-value">${esc(data.uploader || '')}</span>
    </div>
    <div class="cf-detail-item">
      <span class="cf-detail-label">报告日期</span>
      <span class="cf-detail-value">${reportDate}</span>
    </div>
    <div class="cf-detail-item full">
      <span class="cf-detail-label">上传文件（${data.files ? data.files.length : 0}个）</span>
      <div style="margin-top:4px;">${filesHtml}</div>
    </div>
    <div class="cf-detail-item">
      <span class="cf-detail-label">创建时间</span>
      <span class="cf-detail-value">${data.created_at ? new Date(data.created_at).toLocaleString('zh-CN') : '-'}</span>
    </div>
    <div class="cf-detail-item">
      <span class="cf-detail-label">最后更新</span>
      <span class="cf-detail-value">${data.updated_at ? new Date(data.updated_at).toLocaleString('zh-CN') : '-'}</span>
    </div>
  </div>`;
}

// 保存校准报告
async function saveCalibrationRecord() {
  const id = document.getElementById('editCalibrationId').value;
  const instrument_id = document.getElementById('editCfInstrumentId').value;
  const uploader = document.getElementById('editCfUploader').value.trim();
  const report_date = document.getElementById('editCfReportDate').value;

  // 前端校验
  if (!instrument_id) { showToast('请选择仪器', 'error'); return; }
  if (!uploader) { showToast('请填写上传人', 'error'); return; }
  if (!report_date) { showToast('请选择报告日期', 'error'); return; }

  const body = {
    instrument_id: parseInt(instrument_id, 10),
    uploader,
    report_date,
    files: currentCalFiles.length > 0 ? currentCalFiles : null,
  };

  try {
    let resp;
    if (id) {
      resp = await http.put(`/equipment/calibration/${id}`, body);
    } else {
      resp = await http.post('/equipment/calibration', body);
    }
    if (resp && resp.code === 200) {
      showToast(id ? '校准报告更新成功' : '校准报告新增成功');
      closeCalibrationDialog();
      loadCalibrationRecords(document.getElementById('cfSearchInput').value);
    } else {
      showToast(resp?.message || '保存失败', 'error');
    }
  } catch (err) {
    console.error('保存校准报告失败:', err);
    showToast('保存失败: ' + (err.message || '网络错误'), 'error');
  }
}

// 删除校准报告
function deleteCalibrationRecord(id, desc) {
  showModal('确认删除', `<p>确定要删除校准报告 <strong>${esc(desc)}</strong> 吗？此操作不可恢复。</p>`, async (overlay) => {
    try {
      const resp = await http.del(`/equipment/calibration/${id}`);
      if (resp && resp.code === 200) {
        showToast('校准报告已删除');
        overlay.remove();
        loadCalibrationRecords(document.getElementById('cfSearchInput').value);
      } else {
        showToast(resp?.message || '删除失败', 'error');
      }
    } catch (err) {
      console.error('删除校准报告失败:', err);
      showToast('删除失败: ' + (err.message || '网络错误'), 'error');
    }
  });
}

function doCalibrationSearch() {
  const term = document.getElementById('cfSearchInput').value;
  loadCalibrationRecords(term);
}

function clearCalibrationSearch() {
  document.getElementById('cfSearchInput').value = '';
  loadCalibrationRecords();
}
