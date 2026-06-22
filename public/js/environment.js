/* ========================================
   环境设施与洁净合规 — 温湿度记录 CRUD
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  renderUserInfo();
  document.getElementById('sidebarUserName').textContent =
    ((getUser() || {}).display_name || (getUser() || {}).username || '—');

  // 加载温湿度记录列表
  loadTHRecords();

  // Tab 切换
  document.querySelectorAll('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'threcords') {
        doTHSearch();
      }
    });
  });

  // 回车触发搜索
  document.getElementById('thSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doTHSearch();
  });
  document.getElementById('thDateFrom').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doTHSearch();
  });
  document.getElementById('thDateTo').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doTHSearch();
  });

  // 点击遮罩关闭弹窗
  document.addEventListener('click', (e) => {
    if (e.target.id === 'thModal') closeTHDialog();
  });
});

// ========== 搜索 ==========
function doTHSearch() {
  const term = (document.getElementById('thSearchInput') || {}).value || '';
  const dateFrom = (document.getElementById('thDateFrom') || {}).value || '';
  const dateTo = (document.getElementById('thDateTo') || {}).value || '';
  if (dateFrom && dateTo && dateFrom > dateTo) {
    showToast('开始日期不能晚于结束日期', 'error');
    return;
  }
  loadTHRecords(term, dateFrom, dateTo);
}

function clearTHSearch() {
  document.getElementById('thSearchInput').value = '';
  document.getElementById('thDateFrom').value = '';
  document.getElementById('thDateTo').value = '';
  loadTHRecords();
}

// ========== 列表加载 ==========
async function loadTHRecords(searchTerm, dateFrom, dateTo) {
  const tbody = document.getElementById('thTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#9ca3af;">加载中...</td></tr>';

  try {
    const params = new URLSearchParams();
    if (searchTerm && searchTerm.trim()) params.set('search', searchTerm.trim());
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);

    let url = '/environment/threcords';
    const qs = params.toString();
    if (qs) url += '?' + qs;

    const resp = await http.get(url);
    if (!resp || resp.code !== 200) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
      return;
    }

    const data = resp.data || [];
    if (data.length === 0) {
      const msg = (searchTerm || dateFrom || dateTo) ? '未找到匹配的记录' : '暂无温湿度记录，点击「新增记录」添加';
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:#9ca3af;">${msg}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(item => {
      // 稳健解析：兼容字符串 "2026-06-15T00:00:00.000Z" 和 Date 对象
      const d = item.record_date ? new Date(item.record_date) : null;
      const pureDate = d && !isNaN(d.getTime()) ? d.toISOString().substring(0, 10) : '';
      const dateStr = pureDate
        ? d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
        : '—';
      const tempStr = item.temperature != null ? item.temperature + ' °C' : '—';
      const humStr = item.humidity != null ? item.humidity + ' %' : '—';
      return `
        <tr>
          <td>${dateStr}</td>
          <td>${esc(item.period)}</td>
          <td>${tempStr}</td>
          <td>${humStr}</td>
          <td>${esc(item.location || '—')}</td>
          <td>${esc(item.recorder || '—')}</td>
          <td>${esc(item.remarks || '—')}</td>
          <td>
            <button class="btn-icon" title="查看" onclick="openTHDialog(${item.id},'view','${pureDate}')"><i class="fa-solid fa-eye"></i></button>
            <button class="btn-icon" title="编辑" onclick="openTHDialog(${item.id},'edit','${pureDate}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-icon delete" title="删除" onclick="deleteTHRecord(${item.id},'${escJs(dateStr)} ${escJs(item.period)}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('加载温湿度记录失败:', err);
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#dc2626;">加载失败</td></tr>';
  }
}

// ========== 弹窗操作 ==========
function closeTHDialog() {
  document.getElementById('thModal').style.display = 'none';
}

async function openTHDialog(id, mode, dateStr) {
  console.log('[Dialog] openTHDialog 被调用, id:', id, 'mode:', mode, 'dateStr:', dateStr, 'type:', typeof dateStr);
  const modal = document.getElementById('thModal');
  const title = document.getElementById('thModalTitle');
  const formFields = document.getElementById('thFormFields');
  const readOnly = document.getElementById('thReadOnly');
  const actionsAddEdit = document.getElementById('thActionsAddEdit');
  const actionsView = document.getElementById('thActionsView');

  // 重置
  document.getElementById('editTHAmId').value = '';
  document.getElementById('editTHPmId').value = '';
  document.getElementById('editTHSourceDate').value = '';
  clearTHForm();

  if (mode === 'add') {
    title.textContent = '新增温湿度记录';
    formFields.style.display = '';
    readOnly.style.display = 'none';
    actionsAddEdit.style.display = '';
    actionsView.style.display = 'none';
    // 默认日期为今天
    document.getElementById('editTHDate').value = new Date().toISOString().slice(0, 10);
    modal.style.display = 'flex';
    return;
  }

  if (mode === 'edit') {
    title.textContent = '编辑温湿度记录';
    formFields.style.display = '';
    readOnly.style.display = 'none';
    actionsAddEdit.style.display = '';
    actionsView.style.display = 'none';
    modal.style.display = 'flex';

    // 按日期加载该日上/下午两条记录
    if (dateStr) {
      await loadTHFormByDate(dateStr);
    }
    return;
  }

  if (mode === 'view') {
    title.textContent = '温湿度记录详情';
    formFields.style.display = 'none';
    readOnly.style.display = '';
    actionsAddEdit.style.display = 'none';
    actionsView.style.display = '';
    modal.style.display = 'flex';

    // 按日期加载并渲染查看视图
    if (dateStr) {
      await renderTHViewByDate(dateStr);
    }
    return;
  }
}

// ========== 按日期加载表单数据（编辑模式） ==========
async function loadTHFormByDate(dateStr) {
  try {
    console.log('[Edit] 请求日期API, dateStr:', dateStr);
    const resp = await http.get(`/environment/threcords/date/${dateStr}`);
    console.log('[Edit] API响应:', resp);
    if (!resp || resp.code !== 200) {
      showToast(`加载记录失败 (code: ${(resp || {}).code || 'no response'})`, 'error');
      return;
    }

    const records = resp.data || [];
    document.getElementById('editTHDate').value = dateStr;
    document.getElementById('editTHSourceDate').value = dateStr;

    for (const rec of records) {
      if (rec.period === '上午') {
        document.getElementById('editTHAmId').value = rec.id;
        document.getElementById('editTHAmTemp').value = rec.temperature != null ? rec.temperature : '';
        document.getElementById('editTHAmHumidity').value = rec.humidity != null ? rec.humidity : '';
        document.getElementById('editTHAmLocation').value = rec.location || '';
        document.getElementById('editTHAmRecorder').value = rec.recorder || '';
        document.getElementById('editTHAmRemarks').value = rec.remarks || '';
      } else if (rec.period === '下午') {
        document.getElementById('editTHPmId').value = rec.id;
        document.getElementById('editTHPmTemp').value = rec.temperature != null ? rec.temperature : '';
        document.getElementById('editTHPmHumidity').value = rec.humidity != null ? rec.humidity : '';
        document.getElementById('editTHPmLocation').value = rec.location || '';
        document.getElementById('editTHPmRecorder').value = rec.recorder || '';
        document.getElementById('editTHPmRemarks').value = rec.remarks || '';
      }
    }
  } catch (err) {
    console.error('加载温湿度记录表单数据失败:', err);
    showToast('加载记录数据失败', 'error');
  }
}

// ========== 按日期渲染查看视图 ==========
async function renderTHViewByDate(dateStr) {
  const container = document.getElementById('thDetailContent');
  try {
    console.log('[View] 请求日期API, dateStr:', dateStr);
    const resp = await http.get(`/environment/threcords/date/${dateStr}`);
    console.log('[View] API响应:', resp);
    if (!resp || resp.code !== 200) {
      container.innerHTML = `<p style="color:#dc2626;">加载失败 (code: ${(resp || {}).code || 'no response'}, msg: ${esc((resp || {}).message || '')})</p>`;
      return;
    }

    const records = resp.data || [];
    if (records.length === 0) {
      container.innerHTML = '<p style="color:#9ca3af;">暂无该日期的记录</p>';
      return;
    }

    const amRec = records.find(r => r.period === '上午');
    const pmRec = records.find(r => r.period === '下午');

    const d = dateStr ? new Date(dateStr) : null;
    const pureDate = d && !isNaN(d.getTime()) ? d.toISOString().substring(0, 10) : dateStr || '';
    const displayDate = pureDate
      ? (d && !isNaN(d.getTime()) ? d : new Date(pureDate + 'T00:00:00')).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
      : '—';

    container.innerHTML = `
      <div style="margin-bottom:14px;">
        <span class="detail-label" style="font-size:12px;color:var(--text-secondary);">记录日期</span>
        <span style="font-size:15px;font-weight:600;color:var(--text);margin-left:8px;">${displayDate}</span>
      </div>
      <div class="th-view-split">
        <div class="th-view-col">
          <div class="th-col-header"><i class="fa-solid fa-sun"></i> 上午</div>
          ${renderPeriodView(amRec)}
        </div>
        <div class="th-view-col">
          <div class="th-col-header"><i class="fa-solid fa-cloud-sun"></i> 下午</div>
          ${renderPeriodView(pmRec)}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('渲染温湿度详情失败:', err);
    container.innerHTML = '<p style="color:#dc2626;">加载详情失败</p>';
  }
}

function renderPeriodView(rec) {
  if (!rec) {
    return '<p style="color:#9ca3af;font-style:italic;padding:8px 0;">暂无数据</p>';
  }
  return `
    <div class="detail-item">
      <span class="detail-label">温度 (°C)</span>
      <span class="detail-value">${rec.temperature != null ? rec.temperature + ' °C' : '<span class="empty">—</span>'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">湿度 (%RH)</span>
      <span class="detail-value">${rec.humidity != null ? rec.humidity + ' %' : '<span class="empty">—</span>'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">位置</span>
      <span class="detail-value">${rec.location || '<span class="empty">—</span>'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">记录人</span>
      <span class="detail-value">${rec.recorder || '<span class="empty">—</span>'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">备注</span>
      <span class="detail-value">${rec.remarks || '<span class="empty">—</span>'}</span>
    </div>
  `;
}

// ========== 保存 ==========
async function saveTHRecord() {
  const recordDate = document.getElementById('editTHDate').value.trim();
  if (!recordDate) {
    showToast('请选择记录日期', 'error');
    return;
  }

  // 收集上午段数据
  const amData = {
    id: document.getElementById('editTHAmId').value,
    temperature: document.getElementById('editTHAmTemp').value,
    humidity: document.getElementById('editTHAmHumidity').value,
    location: document.getElementById('editTHAmLocation').value.trim(),
    recorder: document.getElementById('editTHAmRecorder').value.trim(),
    remarks: document.getElementById('editTHAmRemarks').value.trim()
  };
  const amHasData = (amData.temperature !== '' && amData.temperature != null) ||
                    (amData.humidity !== '' && amData.humidity != null);

  // 收集下午段数据
  const pmData = {
    id: document.getElementById('editTHPmId').value,
    temperature: document.getElementById('editTHPmTemp').value,
    humidity: document.getElementById('editTHPmHumidity').value,
    location: document.getElementById('editTHPmLocation').value.trim(),
    recorder: document.getElementById('editTHPmRecorder').value.trim(),
    remarks: document.getElementById('editTHPmRemarks').value.trim()
  };
  const pmHasData = (pmData.temperature !== '' && pmData.temperature != null) ||
                    (pmData.humidity !== '' && pmData.humidity != null);

  if (!amHasData && !pmHasData) {
    showToast('请至少填写上午或下午的温度/湿度数据', 'error');
    return;
  }

  try {
    let saved = 0;

    // 保存上午段
    if (amHasData) {
      const payload = {
        record_date: recordDate,
        period: '上午',
        temperature: amData.temperature !== '' ? amData.temperature : null,
        humidity: amData.humidity !== '' ? amData.humidity : null,
        location: amData.location || null,
        recorder: amData.recorder || null,
        remarks: amData.remarks || null
      };
      let resp;
      if (amData.id) {
        resp = await http.put(`/environment/threcords/${amData.id}`, payload);
      } else {
        resp = await http.post('/environment/threcords', payload);
      }
      if (resp && resp.code === 200) saved++;
    } else if (amData.id) {
      // 上午段之前有数据但现在清空了 → 删除
      await http.del(`/environment/threcords/${amData.id}`);
    }

    // 保存下午段
    if (pmHasData) {
      const payload = {
        record_date: recordDate,
        period: '下午',
        temperature: pmData.temperature !== '' ? pmData.temperature : null,
        humidity: pmData.humidity !== '' ? pmData.humidity : null,
        location: pmData.location || null,
        recorder: pmData.recorder || null,
        remarks: pmData.remarks || null
      };
      let resp;
      if (pmData.id) {
        resp = await http.put(`/environment/threcords/${pmData.id}`, payload);
      } else {
        resp = await http.post('/environment/threcords', payload);
      }
      if (resp && resp.code === 200) saved++;
    } else if (pmData.id) {
      // 下午段之前有数据但现在清空了 → 删除
      await http.del(`/environment/threcords/${pmData.id}`);
    }

    if (saved > 0) {
      showToast('温湿度记录保存成功');
      closeTHDialog();
      doTHSearch();
    } else {
      showToast('保存失败', 'error');
    }
  } catch (err) {
    console.error('保存温湿度记录失败:', err);
    showToast('保存失败: ' + (err.message || '网络错误'), 'error');
  }
}

// ========== 删除 ==========
function deleteTHRecord(id, desc) {
  showModal('确认删除', `<p>确定要删除温湿度记录 <strong>${esc(desc)}</strong> 吗？此操作不可恢复。</p>`, async (overlay) => {
    try {
      const resp = await http.del(`/environment/threcords/${id}`);
      if (resp && resp.code === 200) {
        showToast('温湿度记录已删除');
        overlay.remove();
        doTHSearch();
      } else {
        showToast((resp || {}).message || '删除失败', 'error');
      }
    } catch (err) {
      showToast('删除失败: ' + (err.message || '网络错误'), 'error');
    }
  });
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

function clearTHForm() {
  document.getElementById('editTHDate').value = '';
  document.getElementById('editTHAmTemp').value = '';
  document.getElementById('editTHAmHumidity').value = '';
  document.getElementById('editTHAmLocation').value = '';
  document.getElementById('editTHAmRecorder').value = '';
  document.getElementById('editTHAmRemarks').value = '';
  document.getElementById('editTHPmTemp').value = '';
  document.getElementById('editTHPmHumidity').value = '';
  document.getElementById('editTHPmLocation').value = '';
  document.getElementById('editTHPmRecorder').value = '';
  document.getElementById('editTHPmRemarks').value = '';
}

// ========== 小组切换刷新钩子 ==========
window.refreshPageData = async function () {
  const panel = document.getElementById('panel-threcords');
  if (panel && panel.classList.contains('active')) {
    await loadTHRecords();
  }
};
