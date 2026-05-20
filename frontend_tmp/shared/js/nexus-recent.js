/**
 * JORINOVA NEXUS ALIS-X — Recent Patients & Activity Panel
 * Last 20 patients · Favorites pinning · Timestamps · Department · One-click nav
 * Smart filtering · Activity tracking per user
 */
'use strict';

(function (root) {

  const MAX_RECENT   = 20;
  const STORAGE_KEY  = () => `nexus_recent_patients_${window.NEXUS?.userId || 'anon'}`;
  const FAV_KEY      = () => `nexus_fav_patients_${window.NEXUS?.userId || 'anon'}`;

  /* ── Activity types ───────────────────────────────────────────── */
  const ACTION_CONFIG = {
    viewed:     { label:'Viewed',      icon:'👁️', color:'var(--blue-glow)' },
    registered: { label:'Registered',  icon:'➕', color:'var(--alert-green)' },
    received:   { label:'Received',    icon:'📦', color:'var(--cyan)' },
    validated:  { label:'Validated',   icon:'✅', color:'var(--alert-green)' },
    processed:  { label:'Processed',   icon:'⚗️', color:'var(--alert-orange)' },
    result_entry:{ label:'Results',    icon:'📋', color:'var(--alert-yellow)' },
    crossmatch: { label:'Crossmatch',  icon:'🩸', color:'#E74C3C' },
    printed:    { label:'Printed',     icon:'🖨️', color:'var(--text-muted)' },
  };

  /* ── Storage ──────────────────────────────────────────────────── */
  function loadRecent() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY()) || '[]'); }
    catch { return []; }
  }

  function saveRecent(list) {
    try { localStorage.setItem(STORAGE_KEY(), JSON.stringify(list.slice(0, MAX_RECENT))); }
    catch {}
  }

  function loadFavorites() {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY()) || '[]')); }
    catch { return new Set(); }
  }

  function saveFavorites(set) {
    try { localStorage.setItem(FAV_KEY(), JSON.stringify([...set])); }
    catch {}
  }

  /**
   * Track a patient interaction.
   * Call this whenever a patient record is opened, a result is entered, etc.
   */
  function track(patient, action = 'viewed', department = '') {
    if (!patient || !patient.pid) return;
    const list = loadRecent().filter(r => r.pid !== patient.pid); // deduplicate
    list.unshift({
      pid:        patient.pid,
      lid:        patient.lid        || '',
      name:       patient.full_name  || patient.name || 'Unknown',
      age:        patient.age        || '',
      gender:     patient.gender     || '',
      lab_id:     patient.lab_id     || patient.unique_lab_id || '',
      photo:      patient.photo      || null,
      action,
      department: department || window.NEXUS?.module || '',
      url:        patient.url        || `/patients/hub/?pid=${patient.pid}`,
      timestamp:  Date.now(),
    });
    saveRecent(list);
    renderPanel();
  }

  function toggleFavorite(pid) {
    const favs = loadFavorites();
    if (favs.has(pid)) favs.delete(pid);
    else favs.add(pid);
    saveFavorites(favs);
    renderPanel();
  }

  /* ── Panel UI ─────────────────────────────────────────────────── */
  let _panel, _panelOpen = false;

  function buildPanel() {
    if (_panel) return;
    _panel = document.createElement('div');
    _panel.id = 'nr-panel';
    _panel.className = 'nr-panel';
    _panel.setAttribute('aria-label', 'Recent Patients');
    document.body.appendChild(_panel);
    renderPanel();
  }

  function renderPanel() {
    if (!_panel) return;
    const recent = loadRecent();
    const favs   = loadFavorites();
    const favList = recent.filter(r => favs.has(r.pid));
    const regList = recent.filter(r => !favs.has(r.pid));

    _panel.innerHTML = `
      <div class="nr-header">
        <div class="nr-title">🧬 Recent Patients</div>
        <div class="nr-header-actions">
          <input type="text" id="nr-filter-input" class="nr-filter-input" placeholder="Filter…" autocomplete="off">
          <button class="nr-close-btn" id="nr-close-btn" title="Close">×</button>
        </div>
      </div>
      <div class="nr-filter-chips">
        <button class="nr-chip active" data-action="">All</button>
        <button class="nr-chip" data-action="validated">✅ Validated</button>
        <button class="nr-chip" data-action="processed">⚗️ Processed</button>
        <button class="nr-chip" data-action="registered">➕ Registered</button>
        <button class="nr-chip" data-action="received">📦 Received</button>
      </div>
      <div class="nr-body" id="nr-body">
        ${favList.length ? `<div class="nr-section-label">⭐ Pinned</div>${favList.map(r => renderPatientRow(r, true)).join('')}` : ''}
        ${regList.length ? `<div class="nr-section-label">🕐 Recent (${regList.length})</div>${regList.map(r => renderPatientRow(r, false)).join('')}` : ''}
        ${!recent.length ? `<div class="nr-empty"><div style="font-size:36px">🧬</div><div>No recent patients yet.</div><div style="font-size:11px;opacity:.5">Patient interactions appear here automatically.</div></div>` : ''}
      </div>
      <div class="nr-footer">
        <button class="nr-footer-btn" onclick="window.location.href='/patients/hub/'">👁️ All Patients</button>
        <button class="nr-footer-btn" onclick="window.location.href='/patients/register/'">➕ Register New</button>
      </div>`;

    document.getElementById('nr-close-btn')?.addEventListener('click', closePanelUI);

    const filterInput = document.getElementById('nr-filter-input');
    filterInput?.addEventListener('input', () => filterPatients(filterInput.value));

    _panel.querySelectorAll('.nr-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        _panel.querySelectorAll('.nr-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filterPatients(filterInput?.value || '', chip.dataset.action);
      });
    });

    _panel.querySelectorAll('.nr-fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(btn.dataset.pid); });
    });

    _panel.querySelectorAll('.nr-patient-row').forEach(row => {
      row.addEventListener('click', () => {
        const url = row.dataset.url;
        if (url) window.location.href = url;
      });
    });
  }

  function renderPatientRow(r, isFav) {
    const act    = ACTION_CONFIG[r.action] || ACTION_CONFIG.viewed;
    const favs   = loadFavorites();
    const faved  = favs.has(r.pid);
    const initials = (r.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const timeStr  = timeAgo(r.timestamp);

    return `<div class="nr-patient-row" data-pid="${esc(r.pid)}" data-url="${esc(r.url || '')}" title="Open: ${esc(r.name)}">
      <div class="nr-avatar" style="background:radial-gradient(circle at 35% 30%, rgba(120,200,255,.9), rgba(0,40,120,.95))">
        ${r.photo ? `<img src="${esc(r.photo)}" alt="${esc(r.name)}">` : initials}
      </div>
      <div class="nr-info">
        <div class="nr-name">${esc(r.name)}</div>
        <div class="nr-meta">
          <span style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted)">${esc(r.pid)}</span>
          ${r.age ? `· <span>${esc(r.age)}</span>` : ''}
          ${r.department ? `· <span style="color:var(--cyan)">${esc(r.department)}</span>` : ''}
        </div>
      </div>
      <div class="nr-actions">
        <div class="nr-action-badge" style="color:${act.color}" title="${act.label}">${act.icon}</div>
        <div class="nr-time">${timeStr}</div>
        <button class="nr-fav-btn ${faved ? 'faved' : ''}" data-pid="${esc(r.pid)}" title="${faved ? 'Unpin' : 'Pin to top'}">${faved ? '⭐' : '☆'}</button>
      </div>
    </div>`;
  }

  function filterPatients(text, action = null) {
    const body = document.getElementById('nr-body');
    if (!body) return;
    const q = text.toLowerCase();
    body.querySelectorAll('.nr-patient-row').forEach(row => {
      const pid  = row.dataset.pid?.toLowerCase() || '';
      const name = row.querySelector('.nr-name')?.textContent?.toLowerCase() || '';
      const dept = row.querySelector('.nr-meta')?.textContent?.toLowerCase() || '';
      const matchText = !q || pid.includes(q) || name.includes(q) || dept.includes(q);
      row.style.display = matchText ? '' : 'none';
    });
  }

  function openPanel() {
    buildPanel();
    _panel.classList.add('open');
    _panelOpen = true;
  }

  function closePanelUI() {
    _panel?.classList.remove('open');
    _panelOpen = false;
  }

  function togglePanel() {
    _panelOpen ? closePanelUI() : openPanel();
  }

  /* ── Recent activity badge (count on trigger button) ────────── */
  function updateBadge() {
    const badge = document.getElementById('nr-trigger-badge');
    if (!badge) return;
    const count = loadRecent().length;
    badge.textContent = count || '';
    badge.style.display = count ? 'flex' : 'none';
  }

  /* ── Helpers ──────────────────────────────────────────────────── */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function timeAgo(ts) {
    const d = (Date.now() - ts) / 1000;
    if (d < 60)    return `${Math.floor(d)}s`;
    if (d < 3600)  return `${Math.floor(d/60)}m`;
    if (d < 86400) return `${Math.floor(d/3600)}h`;
    return `${Math.floor(d/86400)}d`;
  }

  /* ── Auto-track patients from the URL (patient hub pages) ────── */
  function autoTrackFromPage() {
    const params = new URLSearchParams(window.location.search);
    const pid    = params.get('pid');
    if (pid && window.NEXUS?.userName) {
      // The page needs to populate window._currentPatient for full tracking
      // Modules should call NexusRecent.track() explicitly
    }
  }

  /* ── Public API ────────────────────────────────────────────────── */
  root.NexusRecent = {
    track,
    toggleFavorite,
    openPanel,
    closePanelUI,
    togglePanel,
    updateBadge,
    loadRecent,
  };

  document.addEventListener('DOMContentLoaded', () => {
    autoTrackFromPage();
    updateBadge();
    // Expose globally so modules can call NexusRecent.track(patient, 'viewed')
  });

})(window);
