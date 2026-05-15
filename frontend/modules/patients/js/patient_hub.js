/**
 * JORINOVA NEXUS ALIS-X — Patient Hub
 * Search · Profile · Registration (4-step) · Voice · Recent
 */
'use strict';

(function () {
  const { API, Toast, Confirm, fmt, ShiftEngine } = window.NEXUS;

  /* ─── DOM refs ──────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const $q = (sel, ctx = document) => ctx.querySelector(sel);
  const $all = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const searchInput    = $('global-search');
  const dropdown       = $('search-dropdown');
  const spBody         = $('sp-body');
  const spHint         = $('sp-hint');
  const spList         = $('sp-list');
  const spCount        = $('sp-count');
  const spRecent       = $('sp-recent');
  const stateEmpty     = $('state-empty');
  const stateProfile   = $('state-profile');
  const stateRegister  = $('state-register');

  /* ─── State ─────────────────────────────────────────────────── */
  let searchTimer      = null;
  let activePatient    = null;
  let recentPatients   = _loadRecent();

  /* ════════════════════════════════════════════════════════════
     SEARCH
  ════════════════════════════════════════════════════════════ */
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q.length < 2) { closeDropdown(); return; }
    searchTimer = setTimeout(() => runSearch(q), 280);
  });

  searchInput?.addEventListener('keydown', e => {
    const items = $all('.sd-item', dropdown);
    const cur   = items.findIndex(el => el.classList.contains('selected'));
    if (e.key === 'ArrowDown')  { e.preventDefault(); selectDropItem(items, cur + 1); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); selectDropItem(items, cur - 1); }
    if (e.key === 'Enter')      { e.preventDefault(); items[cur]?.click(); }
    if (e.key === 'Escape')     { closeDropdown(); searchInput.blur(); }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#global-search-wrap')) closeDropdown();
  });

  async function runSearch(q) {
    try {
      const r   = await API.get('/patients/', { q, page_size: 8 });
      const data= await API.json(r);
      const pts = data.results ?? data;
      renderDropdown(pts, q);
      renderSideList(pts);
      spCount.textContent = pts.length ? `${pts.length} found` : '';
    } catch (err) {
      Toast.error('Search failed', err.message);
    }
  }

  function renderDropdown(patients, q) {
    if (!patients.length) { closeDropdown(); return; }
    dropdown.innerHTML = patients.map(p => `
      <div class="sd-item" data-pid="${p.pid}" data-id="${p.id}" role="option" tabindex="-1">
        <div class="sd-avatar">
          ${p.photo ? `<img src="${p.photo}" alt="">` : initials(p)}
        </div>
        <div class="sd-info">
          <div class="sd-name">${hl(p.full_name, q)}</div>
          <div class="sd-meta">${p.pid} · ${p.unique_lab_id} · ${fmt.age(p.date_of_birth)}</div>
        </div>
        ${p.is_inpatient ? '<span class="sd-badge badge badge-orange">Inpatient</span>' : ''}
      </div>
    `).join('');
    $all('.sd-item', dropdown).forEach(el => {
      el.addEventListener('click', () => loadPatient(el.dataset.id));
    });
    dropdown.classList.add('open');
  }

  function renderSideList(patients) {
    if (!patients.length) {
      spList.style.display = 'none';
      spHint.style.display = 'flex';
      spHint.querySelector('p').textContent = 'No patients found';
      return;
    }
    spHint.style.display = 'none';
    spList.style.display = 'flex';
    spList.innerHTML = patients.map(p => `
      <div class="sp-item" data-id="${p.id}" role="button" tabindex="0">
        <div class="sp-avatar">
          ${p.photo ? `<img src="${p.photo}" alt="">` : initials(p)}
        </div>
        <div class="sp-info">
          <div class="sp-name">${escHtml(p.full_name)}</div>
          <div class="sp-pid">${p.pid} · ${fmt.age(p.date_of_birth)} · ${genderIcon(p.gender)}</div>
        </div>
      </div>
    `).join('');
    $all('.sp-item', spList).forEach(el => {
      el.addEventListener('click', () => loadPatient(el.dataset.id));
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') loadPatient(el.dataset.id); });
    });
  }

  function selectDropItem(items, idx) {
    items.forEach(el => el.classList.remove('selected'));
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    items[clamped]?.classList.add('selected');
    items[clamped]?.scrollIntoView({ block: 'nearest' });
  }

  function closeDropdown() {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
  }

  /* ════════════════════════════════════════════════════════════
     PATIENT PROFILE
  ════════════════════════════════════════════════════════════ */
  async function loadPatient(id) {
    closeDropdown();
    showState('profile');
    _setProfileSkeleton();
    try {
      const r = await API.get(`/patients/${id}/`);
      await API.checkError(r);
      activePatient = await API.json(r);
      renderProfile(activePatient);
      saveRecent(activePatient);
      _markSideActive(id);
    } catch (err) {
      Toast.error('Failed to load patient', err.message);
      showState('empty');
    }
  }

  function renderProfile(p) {
    /* Photo */
    const photo   = $('ph-photo');
    const pholder = $('ph-photo-placeholder');
    if (p.photo) {
      photo.src        = p.photo;
      photo.style.display   = 'block';
      pholder.style.display = 'none';
    } else {
      photo.style.display   = 'none';
      pholder.style.display = 'flex';
    }

    /* Core info */
    $('ph-name').textContent   = p.full_name || '—';
    $('ph-pid').textContent    = p.pid;
    $('ph-lab-id').textContent = p.unique_lab_id;

    /* Gender badge */
    const gBadge = $('ph-gender');
    gBadge.textContent  = fmt.capitalize(p.gender || 'Unknown');
    gBadge.className    = `badge ${p.gender === 'male' ? 'badge-blue' : p.gender === 'female' ? 'badge-purple' : 'badge-grey'}`;

    /* Age badge */
    $('ph-age').textContent  = fmt.age(p.date_of_birth);
    $('ph-age').className    = 'badge badge-grey';

    /* Blood group */
    const bBadge = $('ph-blood');
    if (p.blood_group && p.blood_group !== 'unknown') {
      bBadge.textContent = p.blood_group;
      bBadge.className   = 'badge badge-red';
      bBadge.style.display = '';
    } else {
      bBadge.style.display = 'none';
    }

    /* Status dot */
    const dot = $('ph-status-dot');
    dot.className = `status-dot ${p.is_inpatient ? 'status-dot-orange' : 'status-dot-green'}`;

    /* Personal info rows */
    $('info-personal').innerHTML = infoRows([
      ['Date of Birth',  fmt.date(p.date_of_birth)],
      ['Phone',          p.phone  || '—'],
      ['Email',          p.email  || '—'],
      ['National ID',    p.person_id || '—'],
      ['District',       p.district || '—'],
      ['Nationality',    p.nationality || '—'],
    ]);

    /* Medical info rows */
    $('info-medical').innerHTML = infoRows([
      ['Blood Group',   p.blood_group !== 'unknown' ? p.blood_group : '—'],
      ['HIV Status',    hivLabel(p.hiv_status)],
      ['Allergies',     p.allergies || 'None documented'],
      ['Conditions',    p.chronic_conditions || 'None documented'],
      ['Record No.',    p.record_number || '—'],
    ]);

    /* Inpatient card */
    const inpCard = $('inpatient-card');
    if (p.is_inpatient) {
      inpCard.style.display = 'block';
      $('info-inpatient').innerHTML = infoRows([
        ['Ward',       p.ward || '—'],
        ['Bed',        p.bed_number || '—'],
        ['Status',     '<span class="badge badge-orange">Admitted</span>'],
      ]);
    } else {
      inpCard.style.display = 'none';
    }

    /* Lab history tab */
    renderLabHistory(p.id);

    /* Active tab → overview */
    switchTab('overview');
  }

  function infoRows(pairs) {
    return pairs.map(([l, v]) => `
      <div class="info-row">
        <span class="info-label">${escHtml(l)}</span>
        <span class="info-value">${v}</span>
      </div>
    `).join('');
  }

  async function renderLabHistory(patientId) {
    const el = $('lab-list');
    const totEl = $('lab-total');
    if (!el) return;
    el.innerHTML = '<div class="skeleton" style="height:48px;margin-bottom:8px"></div>'.repeat(3);
    try {
      const r    = await API.get('/laboratory/requests/', { patient: patientId, page_size: 10 });
      const data = await API.json(r);
      const reqs = data.results ?? data;
      totEl.textContent = `${data.count ?? reqs.length} requests total`;
      if (!reqs.length) {
        el.innerHTML = '<div class="sp-hint"><i class="fas fa-flask"></i><p>No lab requests yet</p></div>';
        return;
      }
      el.innerHTML = reqs.map(req => `
        <div class="lab-item">
          <span class="lab-item-id">${req.lab_id}</span>
          <div class="lab-item-info">
            <div class="text-sm fw-600">${escHtml(req.test_names?.join(', ') ?? '—')}</div>
            <div class="lab-item-date">${fmt.datetime(req.request_date)}</div>
          </div>
          <span class="badge ${statusBadgeClass(req.status)}">${fmt.capitalize(req.status)}</span>
          ${req.emergency_level === 'emergency' ? '<span class="badge badge-red anim-pulse-critical">STAT</span>' : ''}
        </div>
      `).join('');
    } catch (_) {
      el.innerHTML = '<div class="sp-hint"><p>Failed to load lab history</p></div>';
    }
  }

  /* ════════════════════════════════════════════════════════════
     REGISTRATION FORM (4 steps)
  ════════════════════════════════════════════════════════════ */
  let currentStep = 1;
  const STEPS = 4;

  function showRegistration() {
    currentStep = 1;
    showState('register');
    gotoStep(1);
    $('reg-form')?.reset();
    /* Reset photo preview */
    $('photo-preview') && ($('photo-preview').style.display = 'none');
    $('photo-upload-inner') && ($('photo-upload-inner').style.display = 'flex');
    /* Reset inpatient extras */
    $all('.inpatient-extra').forEach(el => el.classList.remove('visible'));
    $all('.ins-detail').forEach(el => el.classList.remove('visible'));
  }

  function gotoStep(n) {
    currentStep = Math.max(1, Math.min(n, STEPS));
    /* Steps */
    $all('.form-step').forEach((el, i) => {
      el.classList.toggle('active', i + 1 === currentStep);
    });
    /* Step bar items */
    $all('.step-item').forEach((el, i) => {
      el.classList.toggle('active', i + 1 === currentStep);
      el.classList.toggle('done',   i + 1 < currentStep);
    });
    /* Dots */
    $all('.dot').forEach((el, i) => el.classList.toggle('active', i + 1 === currentStep));
    /* Buttons */
    const prev = $('btn-prev');
    const next = $('btn-next');
    if (prev) prev.style.visibility = currentStep === 1 ? 'hidden' : 'visible';
    if (next) {
      next.innerHTML = currentStep === STEPS
        ? '<i class="fas fa-check"></i> Register Patient'
        : 'Next <i class="fas fa-arrow-right"></i>';
    }
  }

  $('btn-next')?.addEventListener('click', async () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < STEPS) {
      gotoStep(currentStep + 1);
    } else {
      await submitRegistration();
    }
  });

  $('btn-prev')?.addEventListener('click', () => gotoStep(currentStep - 1));
  $('btn-back')?.addEventListener('click', () => {
    if (activePatient) showState('profile');
    else showState('empty');
  });

  $('btn-new-patient')?.addEventListener('click', showRegistration);
  $('btn-register-empty')?.addEventListener('click', showRegistration);

  function validateStep(step) {
    const stepEl = $(`step-${step}`);
    if (!stepEl) return true;
    let valid = true;
    stepEl.querySelectorAll('[required]').forEach(inp => {
      inp.classList.remove('fi-error');
      if (!inp.value.trim()) {
        inp.classList.add('fi-error');
        valid = false;
      }
    });
    if (!valid) Toast.warning('Required fields missing', 'Please fill all highlighted fields.');
    return valid;
  }

  async function submitRegistration() {
    const form   = $('reg-form');
    const nextBtn= $('btn-next');
    if (!form) return;

    const formData = new FormData(form);
    nextBtn.classList.add('btn-loading');
    nextBtn.disabled = true;

    try {
      const r = await API.postForm('/patients/', formData);
      await API.checkError(r);
      const patient = await API.json(r);
      Toast.success('Patient Registered', `${patient.full_name} — ${patient.pid}`);
      await loadPatient(patient.id);
    } catch (err) {
      Toast.error('Registration Failed', err.message);
    } finally {
      nextBtn.classList.remove('btn-loading');
      nextBtn.disabled = false;
    }
  }

  /* ─── Inpatient toggle ──────────────────────────────────────── */
  $('inpatient-toggle')?.addEventListener('change', function () {
    $all('.inpatient-extra').forEach(el => el.classList.toggle('visible', this.checked));
  });

  /* ─── Insurance type toggle ─────────────────────────────────── */
  $('ins-type-select')?.addEventListener('change', function () {
    const show = this.value && this.value !== '';
    $all('.ins-detail').forEach(el => el.classList.toggle('visible', show));
  });

  /* ─── Photo upload ───────────────────────────────────────────── */
  const photoUpload  = $('photo-upload');
  const photoFile    = $('photo-file');
  const photoPreview = $('photo-preview');
  const photoInner   = $('photo-upload-inner');

  photoUpload?.addEventListener('click', () => photoFile?.click());
  photoFile?.addEventListener('change', () => {
    const file = photoFile.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      Toast.warning('File too large', 'Maximum photo size is 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      photoPreview.src = e.target.result;
      photoPreview.style.display = 'block';
      photoInner.style.display   = 'none';
    };
    reader.readAsDataURL(file);
  });

  /* ─── Tab switching ──────────────────────────────────────────── */
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  function switchTab(name) {
    $all('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $all('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  }

  /* ─── Profile action buttons ─────────────────────────────────── */
  $('btn-new-request')?.addEventListener('click', () => {
    if (!activePatient) return;
    window.location.href = `/laboratory/new-request/?patient=${activePatient.id}`;
  });

  $('btn-edit-profile')?.addEventListener('click', () => {
    if (!activePatient) return;
    window.location.href = `/patients/${activePatient.id}/edit/`;
  });

  $('btn-print-label')?.addEventListener('click', async () => {
    if (!activePatient) return;
    try {
      const r = await API.get(`/patients/${activePatient.id}/label/`);
      if (r.ok) {
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const win  = window.open(url);
        win?.print();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        Toast.error('Print failed', 'Could not generate label.');
      }
    } catch (err) {
      Toast.error('Print error', err.message);
    }
  });

  $('link-all-labs')?.addEventListener('click', e => {
    e.preventDefault();
    if (activePatient) window.location.href = `/laboratory/?patient=${activePatient.id}`;
  });

  /* ─── Guardian: Add ─────────────────────────────────────────── */
  $('btn-add-guardian')?.addEventListener('click', () => {
    Toast.info('Guardian form', 'Guardian management coming soon.');
  });

  /* ─── Insurance: Add ────────────────────────────────────────── */
  $('btn-add-insurance')?.addEventListener('click', () => {
    Toast.info('Insurance form', 'Insurance management coming soon.');
  });

  /* ════════════════════════════════════════════════════════════
     VOICE SEARCH
  ════════════════════════════════════════════════════════════ */
  const voiceBtn = $('voice-btn');
  let recognition = null;

  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.lang         = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = e => {
      const transcript = e.results[0][0].transcript;
      searchInput.value = transcript;
      searchInput.dispatchEvent(new Event('input'));
    };
    recognition.onend  = () => voiceBtn?.classList.remove('listening');
    recognition.onerror= () => { voiceBtn?.classList.remove('listening'); Toast.warning('Voice search', 'Could not recognize speech.'); };

    voiceBtn?.addEventListener('click', () => {
      if (voiceBtn.classList.contains('listening')) {
        recognition.stop();
      } else {
        voiceBtn.classList.add('listening');
        recognition.start();
      }
    });
  } else {
    voiceBtn?.setAttribute('title', 'Voice search not supported in this browser');
    voiceBtn?.setAttribute('disabled', 'true');
    voiceBtn && (voiceBtn.style.opacity = '0.4');
  }

  /* ════════════════════════════════════════════════════════════
     RECENT PATIENTS
  ════════════════════════════════════════════════════════════ */
  function _loadRecent() {
    try { return JSON.parse(localStorage.getItem('nexus_recent_patients') || '[]'); } catch (_) { return []; }
  }

  function saveRecent(p) {
    recentPatients = [{ id: p.id, full_name: p.full_name, pid: p.pid }, ...recentPatients.filter(r => r.id !== p.id)].slice(0, 5);
    localStorage.setItem('nexus_recent_patients', JSON.stringify(recentPatients));
    renderRecent();
  }

  function renderRecent() {
    if (!spRecent || !recentPatients.length) return;
    spRecent.innerHTML = recentPatients.map(p => `
      <div class="sp-recent-item" data-id="${p.id}" role="button" tabindex="0">
        <i class="fas fa-clock-rotate-left"></i>
        <span>${escHtml(p.full_name)}</span>
      </div>
    `).join('');
    $all('.sp-recent-item', spRecent).forEach(el => {
      el.addEventListener('click', () => loadPatient(el.dataset.id));
    });
  }

  /* ════════════════════════════════════════════════════════════
     STATE HELPERS
  ════════════════════════════════════════════════════════════ */
  function showState(name) {
    stateEmpty   && (stateEmpty.style.display   = name === 'empty'   ? 'flex'  : 'none');
    stateProfile && (stateProfile.style.display = name === 'profile' ? 'flex'  : 'none');
    stateRegister&& (stateRegister.style.display= name === 'register'? 'flex'  : 'none');
  }

  function _setProfileSkeleton() {
    $('ph-name').innerHTML = '<span class="skeleton" style="width:180px;height:22px;display:inline-block"></span>';
    $('info-personal').innerHTML = [1,2,3,4].map(() => `
      <div class="info-row">
        <span class="skeleton" style="width:80px;height:14px;display:inline-block"></span>
        <span class="skeleton" style="width:120px;height:14px;display:inline-block"></span>
      </div>`).join('');
  }

  function _markSideActive(id) {
    $all('.sp-item').forEach(el => el.classList.toggle('active', el.dataset.id === String(id)));
  }

  /* ════════════════════════════════════════════════════════════
     UTILITY
  ════════════════════════════════════════════════════════════ */
  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[c]));
  }

  function hl(text, q) {
    const safe = escHtml(text);
    if (!q) return safe;
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
    return safe.replace(re, '<mark style="background:rgba(0,153,255,0.25);color:inherit;border-radius:2px">$1</mark>');
  }

  function initials(p) {
    const parts = (p.full_name || p.family_name || '?').split(' ');
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  }

  function genderIcon(g) {
    return g === 'male' ? '♂' : g === 'female' ? '♀' : '⚧';
  }

  function hivLabel(status) {
    const labels = { positive: '<span class="badge badge-red">Positive</span>', negative: '<span class="badge badge-green">Negative</span>', unknown: '—', not_disclosed: '—' };
    return labels[status] ?? '—';
  }

  function statusBadgeClass(s) {
    const map = { completed:'badge-green', validated:'badge-green', processing:'badge-blue', received:'badge-cyan', submitted:'badge-grey', cancelled:'badge-grey', draft:'badge-grey' };
    return `badge ${map[s] ?? 'badge-grey'}`;
  }

  /* ════════════════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════════════════ */
  renderRecent();
  showState('empty');
  searchInput?.focus();

})();
