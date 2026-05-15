/**
 * JORINOVA NEXUS — TeleDiag Manager Engine
 * Session deployment · Device monitoring · Camera command · AI gallery
 */
'use strict';

(function () {
  const { API, Toast } = window.NEXUS;
  const BASE = '/telediagnostic/api';

  let sessions  = [];
  let devices   = {};   /* deviceId → device info */
  let captures  = [];
  let aiResults = [];
  let wsMap     = {};   /* sessionCode → WebSocket */

  /* ─── DOM ─────────────────────────────────────────────────────── */
  const deployModal    = document.getElementById('deploy-modal');
  const sessionGrid    = document.getElementById('session-grid');
  const emptyState     = document.getElementById('sessions-empty-state');
  const deviceGrid     = document.getElementById('device-grid');
  const captureGallery = document.getElementById('capture-gallery');
  const aiResultsList  = document.getElementById('ai-results-list');
  const devCountLabel  = document.getElementById('device-count-label');

  /* ─── Tab switching ──────────────────────────────────────────── */
  document.querySelectorAll('.tdiag-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tdiag-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tdiag-body .tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.pane)?.classList.add('active');
    });
  });

  /* ─── Open deploy modal ──────────────────────────────────────── */
  ['open-deploy-modal', 'empty-deploy-btn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      deployModal.classList.add('open');
    });
  });
  document.getElementById('deploy-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('deploy-cancel-btn')?.addEventListener('click', closeModal);
  function closeModal() { deployModal.classList.remove('open'); }

  /* Test check toggles */
  document.querySelectorAll('.tdiag-test-check').forEach(lbl => {
    lbl.querySelector('input')?.addEventListener('change', e => {
      lbl.classList.toggle('active', e.target.checked);
    });
  });

  /* ─── Deploy session ────────────────────────────────────────── */
  document.getElementById('deploy-confirm-btn')?.addEventListener('click', async () => {
    const location    = document.getElementById('dep-location').value.trim() || 'Field';
    const purpose     = document.getElementById('dep-purpose').value;
    const duration    = document.getElementById('dep-duration').value;
    const connectivity= document.getElementById('dep-connectivity').value;
    const enabledTests= Array.from(document.querySelectorAll('.tdiag-test-check input:checked'))
                            .map(i => i.closest('[data-test]')?.dataset.test).filter(Boolean);

    try {
      const r = await fetch(`${BASE}/sessions/create/`, {
        method:  'POST',
        headers: { 'Content-Type':'application/json', 'X-CSRFToken': NEXUS.csrf },
        credentials: 'same-origin',
        body: JSON.stringify({ location, purpose, duration_hours: duration, enabled_tests: enabledTests, connectivity }),
      });
      const data = await r.json();
      if (!data.session_code) throw new Error('No session code returned');

      Toast.success('Session deployed!', `Code: ${data.session_code}`);
      closeModal();

      /* Add to local state */
      sessions.push({
        code:       data.session_code,
        location,
        purpose,
        duration,
        field_url:  data.field_url,
        expires_at: data.expires_at,
        devices:    [],
        captures:   [],
      });

      renderSessions();
      connectSessionWS(data.session_code);
      updateKPIs();
    } catch (err) {
      Toast.error('Deploy failed', err.message);
    }
  });

  /* ─── Render session cards ───────────────────────────────────── */
  function renderSessions() {
    const hasSessions = sessions.length > 0;
    emptyState.style.display  = hasSessions ? 'none' : 'flex';
    sessionGrid.style.display = hasSessions ? 'grid'  : 'none';
    if (!hasSessions) return;

    sessionGrid.innerHTML = sessions.map(s => buildSessionCard(s)).join('');

    /* Wire buttons */
    sessionGrid.querySelectorAll('.copy-link-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = window.location.origin + btn.closest('.tdiag-session-card').dataset.fieldUrl;
        navigator.clipboard?.writeText(url).then(() => Toast.success('Link copied!', url));
      });
    });
    sessionGrid.querySelectorAll('.trigger-all-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.closest('.tdiag-session-card').dataset.sessionCode;
        triggerCameraAll(code);
      });
    });
    sessionGrid.querySelectorAll('.close-session-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.closest('.tdiag-session-card').dataset.sessionCode;
        const ok   = await NEXUS.Confirm.show(`End session ${code}? All field devices will be disconnected.`, 'End Session', 'End Session');
        if (!ok) return;
        await fetch(`${BASE}/sessions/${code}/close/`, {
          method: 'POST', headers: { 'X-CSRFToken': NEXUS.csrf }, credentials: 'same-origin',
        });
        sessions = sessions.filter(s => s.code !== code);
        if (wsMap[code]) { wsMap[code].close(); delete wsMap[code]; }
        renderSessions();
        updateKPIs();
        Toast.info('Session ended', code);
      });
    });
  }

  const PURPOSE_LABELS = {
    outbreak: '🦠 Outbreak',
    field_clinic: '🏕️ Field Clinic',
    disaster: '🆘 Disaster',
    conflict: '⚠️ Conflict Zone',
    refugee: '🏕️ Refugee Camp',
    community: '🌿 Community',
    training: '🎓 Training',
  };

  function buildSessionCard(s) {
    const devCount = Object.values(devices).filter(d => d.sessionCode === s.code).length;
    const capCount = captures.filter(c => c.sessionCode === s.code).length;
    const fieldUrl = window.location.origin + (s.field_url || `/telediagnostic/field/${s.code}/`);
    return `
      <div class="tdiag-session-card" data-session-code="${s.code}" data-field-url="${s.field_url || '/telediagnostic/field/' + s.code + '/'}">
        <div class="tdiag-session-header">
          <div class="tdiag-session-icon">📡</div>
          <div class="tdiag-session-info">
            <div class="tdiag-session-code">${s.code}</div>
            <div class="tdiag-session-location">📍 ${escHtml(s.location)}</div>
            <div class="tdiag-session-purpose-badge">${PURPOSE_LABELS[s.purpose] || s.purpose}</div>
          </div>
          <div class="tdiag-session-meta">
            <div class="tdiag-session-device-count"><span>📱</span> ${devCount} device${devCount!==1?'s':''} connected</div>
          </div>
        </div>
        <div class="tdiag-session-stats">
          <div class="tdiag-ss"><span class="tdiag-ss-val">${capCount}</span><span class="tdiag-ss-lbl">📸 Captures</span></div>
          <div class="tdiag-ss"><span class="tdiag-ss-val">${aiResults.filter(r=>r.sessionCode===s.code).length}</span><span class="tdiag-ss-lbl">🤖 AI Results</span></div>
          <div class="tdiag-ss"><span class="tdiag-ss-val">${devCount}</span><span class="tdiag-ss-lbl">📱 Online</span></div>
        </div>
        <div class="tdiag-session-link-row">
          <div class="tdiag-session-link-wrap">
            <span class="tdiag-link-label">Field Link:</span>
            <span class="tdiag-link-url">${fieldUrl.slice(0, 52)}…</span>
            <button class="btn-icon btn-icon-sm copy-link-btn" title="Copy"><i class="fas fa-copy"></i></button>
          </div>
          <div style="display:flex;gap:var(--space-sm)">
            <button class="btn tdiag-btn-sm trigger-all-btn"><span>📸</span> Capture All</button>
            <button class="btn tdiag-btn-sm" onclick="window.open('${fieldUrl}','_blank')"><span>🔗</span> Open Field</button>
            <button class="btn tdiag-btn-sm tdiag-btn-danger close-session-btn"><span>🔴</span> End</button>
          </div>
        </div>
      </div>`;
  }

  /* ─── WebSocket per session ──────────────────────────────────── */
  function connectSessionWS(code) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url   = `${proto}//${location.host}/ws/telediag/${code}/`;
    try {
      const socket = new WebSocket(url);
      wsMap[code]  = socket;
      socket.onopen    = () => console.log(`[TeleDiag] WS open for ${code}`);
      socket.onmessage = (e) => { try { handleSessionMsg(code, JSON.parse(e.data)); } catch(_) {} };
      socket.onerror   = () => {};
      socket.onclose   = () => { delete wsMap[code]; };
    } catch (_) {}
  }

  function handleSessionMsg(code, msg) {
    switch (msg.type) {
      case 'device_registered':
        devices[msg.device_id] = { ...msg.device_info, sessionCode: code, deviceId: msg.device_id, role: msg.role, online: true };
        updateDeviceGrid();
        updateKPIs();
        renderSessions();
        if (msg.role === 'field') Toast.info('Field device connected', `${code} · ${msg.device_id}`);
        break;

      case 'device_disconnected':
        if (devices[msg.device_id]) devices[msg.device_id].online = false;
        updateDeviceGrid();
        updateKPIs();
        renderSessions();
        break;

      case 'photo_relayed':
        addCapture(code, msg);
        break;

      case 'location_updated':
        if (devices[msg.device_id]) {
          devices[msg.device_id].lat = msg.lat;
          devices[msg.device_id].lng = msg.lng;
          updateMapPositions();
        }
        break;
    }
  }

  /* ─── Camera trigger ─────────────────────────────────────────── */
  async function triggerCameraAll(code) {
    const onlineDevices = Object.values(devices).filter(d => d.sessionCode === code && d.online);
    if (!onlineDevices.length) {
      Toast.warning('No devices online', 'Deploy the session link to field staff first.');
      return;
    }
    try {
      await fetch(`${BASE}/trigger-camera/`, {
        method:  'POST',
        headers: { 'Content-Type':'application/json', 'X-CSRFToken': NEXUS.csrf },
        credentials: 'same-origin',
        body: JSON.stringify({ session_code: code, command: 'capture' }),
      });
      Toast.success('Capture command sent', `${onlineDevices.length} device(s) notified`);
    } catch (e) {
      Toast.error('Command failed', e.message);
    }
  }

  /* ─── Captures & gallery ─────────────────────────────────────── */
  function addCapture(code, msg) {
    const entry = {
      sessionCode: code,
      deviceId:    msg.device_id,
      image:       msg.image,
      test_type:   msg.test_type,
      ai_result:   msg.ai_result,
      ts:          msg.timestamp || new Date().toISOString(),
    };
    captures.unshift(entry);
    aiResults.unshift({ ...entry, sessionCode: code });
    renderGallery();
    renderAIResults();
    updateKPIs();
    renderSessions();
    Toast.success('📸 New capture received', `${entry.test_type} from device ${entry.deviceId}`);
  }

  function renderGallery() {
    const isEmpty = !captures.length;
    captureGallery.innerHTML = isEmpty
      ? '<div class="tdiag-empty-state"><div class="tdiag-empty-icon">📸</div><p>No captures yet.</p></div>'
      : captures.map(c => `
          <div class="tdiag-gallery-item">
            ${c.image ? `<img src="${c.image}" class="tdiag-gallery-img" alt="Capture">` : '<div class="tdiag-gallery-no-img">📷</div>'}
            <div class="tdiag-gallery-info">
              <div class="tdiag-gallery-test">${TEST_LABELS[c.test_type] || c.test_type}</div>
              <div class="tdiag-gallery-result" style="color:${c.ai_result?.flag_color||'#00AAFF'}">${c.ai_result?.result||'—'}</div>
              <div class="tdiag-gallery-time">${new Date(c.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
            </div>
          </div>`).join('');
    document.getElementById('gallery-count').textContent = `${captures.length} capture${captures.length!==1?'s':''}`;
  }

  function renderAIResults() {
    aiResultsList.innerHTML = !aiResults.length
      ? '<div class="tdiag-empty-state"><div class="tdiag-empty-icon">🤖</div><p>No AI results yet.</p></div>'
      : aiResults.map(r => `
          <div class="tdiag-ai-result-card">
            ${r.image ? `<img src="${r.image}" class="tdiag-ai-thumb" alt="">` : '<div class="tdiag-ai-thumb-placeholder">📷</div>'}
            <div class="tdiag-ai-info">
              <div class="tdiag-ai-test-title">${r.ai_result?.test||TEST_LABELS[r.test_type]||r.test_type}</div>
              <div class="tdiag-ai-result-val" style="color:${r.ai_result?.flag_color||'#00AAFF'}">${r.ai_result?.result||'—'}</div>
              <div class="tdiag-ai-interp">${r.ai_result?.interpretation||''}</div>
              <div class="tdiag-ai-meta-row">
                <span class="badge badge-grey">${r.deviceId||'—'}</span>
                <span class="badge badge-blue">${r.ai_result?.confidence||''}</span>
                <span class="tdiag-ai-time">${new Date(r.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span>
              </div>
              ${buildWells(r)}
            </div>
          </div>`).join('');
  }

  function buildWells(r) {
    if (!r.ai_result?.wells) return '';
    const NAMES = ['ONPG','ADH','LDC','ODC','CIT','H₂S','URE','TDA','IND','VP','GEL','GLU','MAN','INO','SOR','RHA','SAC','MEL','AMY','ARA'];
    return `<div class="tdiag-wells-mini">${r.ai_result.wells.map((v,i)=>`
      <div class="tdiag-well-mini ${v?'pos':'neg'}" title="${NAMES[i]||i}">${v?'+':'−'}</div>`).join('')}</div>`;
  }

  /* ─── Device grid ────────────────────────────────────────────── */
  function updateDeviceGrid() {
    const devList = Object.values(devices);
    deviceGrid.innerHTML = !devList.length
      ? '<div class="tdiag-empty-state"><div class="tdiag-empty-icon">📱</div><p>No devices connected yet.</p></div>'
      : devList.map(d => `
          <div class="tdiag-device-card ${d.online ? 'online' : 'offline'}">
            <div class="tdiag-dev-status-dot"></div>
            <div class="tdiag-dev-icon">${d.role === 'field' ? '📱' : '🖥️'}</div>
            <div class="tdiag-dev-info">
              <div class="tdiag-dev-id">${escHtml(d.deviceId)}</div>
              <div class="tdiag-dev-user">${escHtml(d.user||'Unknown')}</div>
              <div class="tdiag-dev-meta">${escHtml(d.screen||'')} · ${d.online?'🟢 Online':'🔴 Offline'}</div>
              ${d.lat ? `<div class="tdiag-dev-gps">📍 ${d.lat}, ${d.lng}</div>` : ''}
            </div>
            ${d.online && d.role === 'field' ? `
            <div class="tdiag-dev-actions">
              <button class="btn tdiag-btn-sm" onclick="triggerDevice('${d.sessionCode}','${d.deviceId}')">📸 Capture</button>
            </div>` : ''}
          </div>`).join('');
    const onlineCount = Object.values(devices).filter(d => d.online).length;
    devCountLabel.textContent = `${onlineCount} device${onlineCount!==1?'s':''} online`;
  }
  window.triggerDevice = async (code, deviceId) => {
    await fetch(`${BASE}/trigger-camera/`, {
      method: 'POST', headers: {'Content-Type':'application/json','X-CSRFToken':NEXUS.csrf},
      credentials:'same-origin',
      body: JSON.stringify({ session_code: code, device_id: deviceId, command: 'capture' }),
    });
    Toast.success('Capture triggered', deviceId);
  };

  /* ─── Map positions ──────────────────────────────────────────── */
  function updateMapPositions() {
    const posList = document.getElementById('tdiag-device-positions');
    if (!posList) return;
    const gpsDevices = Object.values(devices).filter(d => d.lat && d.online);
    posList.innerHTML = gpsDevices.length ? gpsDevices.map(d => `
      <div class="tdiag-pos-card">
        <span>📱</span>
        <div><strong>${escHtml(d.deviceId)}</strong><br>
        <span style="font-family:var(--font-mono);font-size:11px">📍 ${d.lat}, ${d.lng}</span></div>
      </div>`).join('') : '';
  }

  /* ─── KPIs ───────────────────────────────────────────────────── */
  function updateKPIs() {
    const onlineCount  = Object.values(devices).filter(d => d.online).length;
    const locationSet  = new Set(sessions.map(s => s.location));
    setText('tk-sessions', sessions.length);
    setText('tk-devices', onlineCount);
    setText('tk-captures', captures.length);
    setText('tk-ai', aiResults.length);
    setText('tk-locations', locationSet.size);
  }

  function setText(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }

  /* ─── Utils ──────────────────────────────────────────────────── */
  function escHtml(s) {
    return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  const TEST_LABELS = {
    ast:'AST Strip', api_20e:'API 20E', api_20ne:'API 20NE',
    rdt_malaria:'Malaria RDT', rdt_covid:'COVID-19 RDT', rdt_hiv:'HIV RDT',
    wound:'Wound Photo', gram_stain:'Gram Stain', patient:'Patient Photo', photo:'Photo',
  };

})();
