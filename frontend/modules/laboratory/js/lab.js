/**
 * JORINOVA NEXUS ALIS-X — Laboratory Worklist
 * Department tabs · Worklist · Sample reception · Result entry · Validation
 */
'use strict';

(function () {
  const { API, Toast, Confirm, fmt, ShiftEngine } = window.NEXUS;

  /* ─── State ─────────────────────────────────────────────────── */
  let activeDept     = 'all';
  let activeStatus   = 'pending';
  let searchQuery    = '';
  let worklist       = [];
  let selectedReq    = null;
  let resultDraft    = {};     /* { rt_id: { value, comment } } */
  let refreshTimer   = null;

  /* ─── DOM ────────────────────────────────────────────────────── */
  const tbody          = document.getElementById('worklist-tbody');
  const resultCount    = document.getElementById('result-count');
  const deptTabsBar    = document.getElementById('dept-tabs-bar');
  const statusFilter   = document.getElementById('filter-status');
  const emergFilter    = document.getElementById('filter-emerg');
  const dateFilter     = document.getElementById('filter-date');
  const searchInput    = document.getElementById('worklist-search');
  const resultModal    = document.getElementById('result-modal');
  const resultModalOverlay = document.getElementById('result-modal-overlay');

  /* ════════════════════════════════════════════════════════════
     DEPARTMENT TABS
  ════════════════════════════════════════════════════════════ */
  deptTabsBar?.querySelectorAll('.dept-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      deptTabsBar.querySelectorAll('.dept-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeDept = tab.dataset.dept || 'all';
      loadWorklist();
    });
  });

  /* ════════════════════════════════════════════════════════════
     FILTERS
  ════════════════════════════════════════════════════════════ */
  statusFilter?.addEventListener('change', () => { activeStatus = statusFilter.value; loadWorklist(); });
  emergFilter?.addEventListener('change',  () => loadWorklist());
  dateFilter?.addEventListener('change',   () => loadWorklist());

  let searchTimer = null;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchQuery = searchInput.value.trim(); loadWorklist(); }, 300);
  });

  /* ════════════════════════════════════════════════════════════
     LOAD WORKLIST
  ════════════════════════════════════════════════════════════ */
  async function loadWorklist() {
    showLoading();
    const params = {};
    if (activeStatus)              params.status        = activeStatus;
    if (activeDept !== 'all')      params.department    = activeDept;
    if (emergFilter?.value)        params.emergency_level = emergFilter.value;
    if (dateFilter?.value)         params.date_from     = dateFilter.value;
    if (searchQuery)               params.search        = searchQuery;

    try {
      const r    = await API.get('/laboratory/requests/', params);
      await API.checkError(r);
      const data = await API.json(r);
      worklist   = data.results ?? data;
      renderWorklist(worklist);
      updateDeptCounts(worklist);
    } catch (err) {
      showError(err.message);
      if (NEXUS.debug) console.warn('Worklist load error:', err);
    }
  }

  /* ════════════════════════════════════════════════════════════
     RENDER WORKLIST
  ════════════════════════════════════════════════════════════ */
  function renderWorklist(items) {
    if (!tbody) return;
    resultCount && (resultCount.textContent = `${items.length} request${items.length !== 1 ? 's' : ''}`);
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="8">
        <div class="worklist-empty">
          <i class="fas fa-flask"></i>
          <h3>No requests</h3>
          <p>No lab requests match the current filters.</p>
        </div>
      </td></tr>`;
      return;
    }
    tbody.innerHTML = items.map(req => {
      const emClass = emergencyRowClass(req.emergency_level);
      const sample  = req.samples?.[0];
      const tat     = sample ? tatDisplay(sample) : null;
      return `
      <tr class="${emClass}" data-id="${req.id}" role="row" tabindex="0">
        <td>
          <div class="cell-patient">
            <div class="cell-avatar">
              ${req.patient_photo ? `<img src="${req.patient_photo}" alt="">` : patInitials(req.patient_name)}
            </div>
            <div class="cell-patient-info">
              <div class="cell-patient-name">${escHtml(req.patient_name)}</div>
              <div class="cell-patient-meta">${escHtml(req.patient_pid)} · ${escHtml(req.patient_age || '—')} · ${genderSymbol(req.patient_gender)}</div>
            </div>
          </div>
        </td>
        <td><span class="cell-labid">${escHtml(req.lab_id)}</span></td>
        <td>
          <div class="test-pills">
            ${(req.test_names || []).slice(0, 3).map(t => `<span class="test-pill badge badge-blue">${escHtml(t)}</span>`).join('')}
            ${(req.test_names?.length || 0) > 3 ? `<span class="more-tests">+${(req.test_names.length - 3)} more</span>` : ''}
          </div>
        </td>
        <td>
          ${tat ? `
          <div class="tat-cell">
            <span class="tat-time ${tat.status}">${tat.label}</span>
            <div class="tat-bar" style="width:80px">
              <div class="tat-fill ${tat.status}" style="width:${tat.pct}%"></div>
            </div>
          </div>` : '<span class="text-muted-c text-xs">—</span>'}
        </td>
        <td>${emergencyBadge(req.emergency_level)}</td>
        <td>${statusBadge(req.status)}</td>
        <td>
          ${req.doctor_name ? `<span class="text-xs text-secondary-c">${escHtml(req.doctor_name)}</span>` : ''}
          ${req.ward ? `<span class="badge badge-grey text-xs" style="margin-left:4px">${escHtml(req.ward)}</span>` : ''}
        </td>
        <td>
          <div style="display:flex;gap:4px;justify-content:flex-end">
            ${req.status === 'submitted' ? `<button class="btn btn-xs btn-primary btn-receive" data-id="${req.id}" title="Receive sample"><i class="fas fa-inbox"></i></button>` : ''}
            ${['received','processing'].includes(req.status) ? `<button class="btn btn-xs btn-secondary btn-enter" data-id="${req.id}" title="Enter results"><i class="fas fa-pen-to-square"></i> Results</button>` : ''}
            ${req.status === 'processing' ? `<button class="btn btn-xs btn-success btn-validate" data-id="${req.id}" title="Validate"><i class="fas fa-check-double"></i></button>` : ''}
            ${req.is_high_risk ? `<span class="biosafety-tag" title="High-risk specimen"><i class="fas fa-biohazard"></i></span>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');

    /* Bind row events */
    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        openResultModal(row.dataset.id);
      });
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter') openResultModal(row.dataset.id);
      });
    });

    tbody.querySelectorAll('.btn-receive').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); receiveRequest(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-enter').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openResultModal(btn.dataset.id); });
    });
    tbody.querySelectorAll('.btn-validate').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); validateRequest(btn.dataset.id); });
    });
  }

  function updateDeptCounts(items) {
    const counts = {};
    items.forEach(req => {
      (req.test_names || []).forEach(() => {
        /* we don't have dept on list items directly; skip */
      });
    });
    /* Update "All" count */
    const allTab = deptTabsBar?.querySelector('[data-dept="all"] .dept-tab-count');
    if (allTab) allTab.textContent = items.length;
  }

  /* ════════════════════════════════════════════════════════════
     SAMPLE RECEPTION
  ════════════════════════════════════════════════════════════ */
  async function receiveRequest(id) {
    const ok = await Confirm.show(
      'Mark this sample as received in the laboratory?',
      'Receive Sample',
      'Receive',
      false
    );
    if (!ok) return;
    try {
      const r = await API.post(`/laboratory/requests/${id}/receive/`, {});
      await API.checkError(r);
      Toast.success('Sample Received', 'TAT timer started.');
      loadWorklist();
    } catch (err) {
      Toast.error('Reception Failed', err.message);
    }
  }

  /* ════════════════════════════════════════════════════════════
     VALIDATE REQUEST
  ════════════════════════════════════════════════════════════ */
  async function validateRequest(id) {
    const ok = await Confirm.show(
      'Validate all completed results for this request? This will release results for printing.',
      'Validate Results',
      'Validate',
      false
    );
    if (!ok) return;
    try {
      const r = await API.post(`/laboratory/requests/${id}/validate/`, {});
      await API.checkError(r);
      Toast.success('Validated', 'Results released and ready for printing.');
      loadWorklist();
    } catch (err) {
      Toast.error('Validation Failed', err.message);
    }
  }

  /* ════════════════════════════════════════════════════════════
     RESULT ENTRY MODAL
  ════════════════════════════════════════════════════════════ */
  async function openResultModal(id) {
    resultDraft = {};
    selectedReq = null;
    showModalLoading();
    resultModalOverlay?.classList.add('open');

    try {
      const r   = await API.get(`/laboratory/requests/${id}/`);
      await API.checkError(r);
      selectedReq = await API.json(r);
      renderResultModal(selectedReq);
    } catch (err) {
      Toast.error('Load Failed', err.message);
      closeResultModal();
    }
  }

  function renderResultModal(req) {
    if (!resultModal) return;
    /* Header */
    const nameEl = resultModal.querySelector('#rm-patient-name');
    const metaEl = resultModal.querySelector('#rm-patient-meta');
    if (nameEl) nameEl.textContent = req.patient_name;
    if (metaEl) metaEl.textContent = `${req.lab_id} · ${req.patient_pid} · ${req.patient_age} · ${req.patient_gender?.toUpperCase()}`;

    /* Tests */
    const testsEl = document.getElementById('rm-tests-list');
    if (!testsEl) return;
    const tests = req.requested_tests || [];
    if (!tests.length) {
      testsEl.innerHTML = '<p class="text-muted-c text-xs">No tests found.</p>';
      return;
    }
    testsEl.innerHTML = tests.map(rt => {
      const existing = rt.result;
      const completed = ['completed','validated'].includes(rt.status);
      return `
      <div class="result-test-block" data-rt-id="${rt.id}">
        <div class="result-test-header">
          <div class="result-test-name">
            <span class="test-pill badge badge-blue">${escHtml(rt.test?.short_name || rt.test?.name || '—')}</span>
            ${escHtml(rt.test?.name || '')}
            ${completed ? '<span class="badge badge-green" style="margin-left:4px"><i class="fas fa-check"></i> Done</span>' : ''}
          </div>
          <span class="result-test-ref">Ref: ${escHtml(rt.test?.reference_range || '—')} ${escHtml(rt.test?.unit || '')}</span>
        </div>
        <div class="result-input-row">
          <input type="number"
                 class="result-value-input"
                 id="rv-${rt.id}"
                 placeholder="Enter value…"
                 value="${existing?.numeric_value ?? existing?.value ?? ''}"
                 step="any"
                 ${rt.status === 'validated' ? 'readonly' : ''}>
          <span class="result-unit">${escHtml(rt.test?.unit || '')}</span>
          <span class="result-flag-indicator" id="rf-${rt.id}">
            ${existing?.flag ? `<span class="flag-${existing.flag}">${existing.flag}</span>` : '—'}
          </span>
        </div>
        <textarea class="result-comment-input"
                  id="rc-${rt.id}"
                  placeholder="Technician comment (optional)…"
                  ${rt.status === 'validated' ? 'readonly' : ''}>${escHtml(existing?.technician_comment || '')}</textarea>
      </div>`;
    }).join('');

    /* Live flag feedback */
    testsEl.querySelectorAll('.result-value-input').forEach(inp => {
      inp.addEventListener('input', () => autoFlag(inp));
      autoFlag(inp);
    });

    /* Save/Validate buttons */
    const saveBtn     = document.getElementById('rm-save-btn');
    const validateBtn = document.getElementById('rm-validate-btn');
    if (saveBtn)     saveBtn.onclick     = () => saveAllResults(req.id, tests);
    if (validateBtn) validateBtn.onclick = () => { closeResultModal(); validateRequest(req.id); };
    if (validateBtn) validateBtn.style.display = req.status === 'processing' ? 'flex' : 'none';
  }

  function autoFlag(inp) {
    const block   = inp.closest('[data-rt-id]');
    const rtId    = block?.dataset.rtId;
    const flagEl  = document.getElementById(`rf-${rtId}`);
    const refText = block?.querySelector('.result-test-ref')?.textContent?.match(/Ref:\s*([\d.]+)-([\d.]+)/);
    const val     = parseFloat(inp.value);

    inp.classList.remove('flag-high','flag-low','flag-critical','flag-normal');
    if (!flagEl) return;

    if (isNaN(val)) { flagEl.innerHTML = '—'; return; }
    if (!refText)   { flagEl.innerHTML = '—'; return; }

    const lo = parseFloat(refText[1]);
    const hi = parseFloat(refText[2]);
    let flag = 'N';
    if      (val > hi * 1.5 || val < lo * 0.5) { flag = val > hi ? 'HH' : 'LL'; inp.classList.add('flag-critical'); }
    else if (val > hi)                           { flag = 'H';  inp.classList.add('flag-high'); }
    else if (val < lo)                           { flag = 'L';  inp.classList.add('flag-low'); }
    else                                         { inp.classList.add('flag-normal'); }
    flagEl.innerHTML = `<span class="flag-${flag}">${flag}</span>`;
  }

  async function saveAllResults(reqId, tests) {
    const btn = document.getElementById('rm-save-btn');
    if (btn) { btn.classList.add('btn-loading'); btn.disabled = true; }
    let saved = 0, failed = 0;

    for (const rt of tests) {
      if (['validated'].includes(rt.status)) continue;
      const inp = document.getElementById(`rv-${rt.id}`);
      const cmt = document.getElementById(`rc-${rt.id}`);
      if (!inp?.value.trim()) continue;

      try {
        const r = await API.post(
          `/laboratory/requests/${reqId}/enter-result/${rt.id}/`, {
            value:               inp.value.trim(),
            numeric_value:       isNaN(parseFloat(inp.value)) ? null : parseFloat(inp.value),
            technician_comment:  cmt?.value.trim() || '',
          }
        );
        await API.checkError(r);
        saved++;
      } catch (err) {
        failed++;
        Toast.error(`Result save failed: ${rt.test?.name}`, err.message);
      }
    }

    if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
    if (saved)  Toast.success(`${saved} result${saved > 1 ? 's' : ''} saved`, 'Ready for validation.');
    if (!failed) { closeResultModal(); loadWorklist(); }
  }

  function showModalLoading() {
    if (!resultModal) return;
    const nameEl = resultModal.querySelector('#rm-patient-name');
    const testsEl = document.getElementById('rm-tests-list');
    if (nameEl) nameEl.innerHTML = '<span class="skeleton" style="width:180px;height:18px;display:inline-block"></span>';
    if (testsEl) testsEl.innerHTML = [1,2,3].map(() => `<div class="skeleton" style="height:90px;margin-bottom:12px;border-radius:8px"></div>`).join('');
  }

  function closeResultModal() {
    resultModalOverlay?.classList.remove('open');
    selectedReq = null;
    resultDraft = {};
  }

  document.getElementById('rm-close-btn')?.addEventListener('click', closeResultModal);
  resultModalOverlay?.addEventListener('click', e => {
    if (e.target === resultModalOverlay) closeResultModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && resultModalOverlay?.classList.contains('open')) closeResultModal();
  });

  /* ════════════════════════════════════════════════════════════
     LOADING / ERROR STATES
  ════════════════════════════════════════════════════════════ */
  function showLoading() {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8">
      <div class="worklist-loading">
        <i class="fas fa-spinner"></i> Loading worklist…
      </div>
    </td></tr>`;
  }

  function showError(msg) {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8">
      <div class="worklist-empty">
        <i class="fas fa-triangle-exclamation" style="color:var(--alert-red)"></i>
        <h3>Load error</h3>
        <p>${escHtml(msg)}</p>
      </div>
    </td></tr>`;
  }

  /* ════════════════════════════════════════════════════════════
     HELPERS
  ════════════════════════════════════════════════════════════ */
  function tatDisplay(sample) {
    if (!sample.tat_start) return null;
    return {
      label:  `${sample.tat_elapsed ?? 0}m`,
      pct:    sample.tat_pct ?? 0,
      status: sample.tat_status ?? 'green',
    };
  }

  function emergencyRowClass(lvl) {
    return { emergency: 'row-emergency', urgent: 'row-urgent', normal: '' }[lvl] ?? '';
  }

  function emergencyBadge(lvl) {
    const map = {
      emergency: `<span class="badge badge-red anim-pulse-critical">STAT</span>`,
      urgent:    `<span class="badge badge-orange">Urgent</span>`,
      routine:   `<span class="badge badge-grey">Routine</span>`,
      normal:    `<span class="badge badge-grey">Normal</span>`,
    };
    return map[lvl] ?? `<span class="badge badge-grey">${escHtml(lvl)}</span>`;
  }

  function statusBadge(s) {
    const map = {
      submitted:  `<span class="badge badge-blue">Submitted</span>`,
      received:   `<span class="badge badge-cyan">Received</span>`,
      processing: `<span class="badge badge-orange">Processing</span>`,
      completed:  `<span class="badge badge-yellow">Completed</span>`,
      validated:  `<span class="badge badge-green">Validated</span>`,
      cancelled:  `<span class="badge badge-grey">Cancelled</span>`,
    };
    return map[s] ?? `<span class="badge badge-grey">${escHtml(s)}</span>`;
  }

  function patInitials(name) {
    const p = (name || '?').split(' ');
    return (p[0]?.[0] || '') + (p[1]?.[0] || '');
  }

  function genderSymbol(g) {
    return g === 'male' ? '♂' : g === 'female' ? '♀' : '⚧';
  }

  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  /* ════════════════════════════════════════════════════════════
     AUTO-REFRESH every 30s
  ════════════════════════════════════════════════════════════ */
  function startRefresh() {
    refreshTimer = setInterval(loadWorklist, 30_000);
  }

  /* ════════════════════════════════════════════════════════════
     BOOT
  ════════════════════════════════════════════════════════════ */
  loadWorklist();
  startRefresh();

  /* Expose for debugging */
  window._labReload = loadWorklist;

})();
