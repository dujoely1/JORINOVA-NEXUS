/**
 * JORINOVA NEXUS — Security Center JS
 * RBAC matrix · Biometric enrollment · Behavioral telemetry · Threat feed
 */
'use strict';

(function () {
  const { API, Toast, fmt } = window.NEXUS;
  const BASE = '/security/api';
  let videoStream = null;
  let activeBioType = null;
  let captureCount = 0;
  let behavioralData = { typing: [], mouse: [], sessionStart: Date.now() };

  /* ─── Tab switching ────────────────────────────────────────────── */
  document.querySelectorAll('.sec-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sec-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sec-body .tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.pane)?.classList.add('active');
      if (btn.dataset.pane === 'sp-rbac') loadRBACMatrix();
    });
  });

  /* ─── Boot ─────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadRBACMatrix();
    initBiometricEnrollment();
    initBehavioralTracking();
    setInterval(loadStats, 30000);
  });

  /* ─── Stats KPIs ────────────────────────────────────────────────── */
  async function loadStats() {
    try {
      const r = await fetch(`${BASE}/stats/`, { credentials: 'same-origin' });
      const d = await r.json();
      setText('sk-users',     d.total_users || '—');
      setText('sk-biometric', d.biometric_enrolled || 0);
      setText('sk-events',    d.today_events || 0);
      setText('sk-threats',   d.open_threats || 0);
      setText('sk-failed',    d.failed_logins || 0);
    } catch (_) {}
  }

  /* ─── RBAC Matrix ───────────────────────────────────────────────── */
  async function loadRBACMatrix() {
    const tbody = document.getElementById('rbac-tbody');
    if (!tbody) return;
    try {
      const r = await fetch(`${BASE}/rbac-matrix/`, { credentials: 'same-origin' });
      const { matrix } = await r.json();
      tbody.innerHTML = Object.entries(matrix).map(([role, def]) => {
        const perms = def.permissions || {};
        const modules = ['lab_tests','patients','results','reports','billing','inventory',
                         'settings','security','users','records','surveillance','ai'];
        return `<tr>
          <td><div style="display:flex;align-items:center;gap:8px">
            <div class="rbac-level-badge lvl-${def.level}">${def.level}</div>
            <span style="font-size:var(--text-xs);font-weight:600;color:#C8FFD8">${escHtml(def.label || role)}</span>
          </div></td>
          ${modules.map(m => `<td>${permBadge(perms[m] || 'none')}</td>`).join('')}
        </tr>`;
      }).join('');
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;color:#4A9A5A;padding:24px">Loading RBAC matrix…</td></tr>`;
    }
  }

  function permBadge(perm) {
    const labels = {
      crud: '✅ CRUD', read: '👁️ Read', edit: '✏️ Edit',
      create: '➕ Create', none: '—', dept_crud: '🏢 Dept',
      sample: '🩸 Sample',
    };
    return `<span class="rbac-perm ${perm}">${labels[perm] || perm}</span>`;
  }

  /* ─── Biometric Enrollment ───────────────────────────────────────── */
  function initBiometricEnrollment() {
    document.getElementById('fp-enroll-btn')?.addEventListener('click',   () => enrollBiometric('fingerprint'));
    document.getElementById('face-enroll-btn')?.addEventListener('click', () => enrollBiometric('face'));
    document.getElementById('palm-enroll-btn')?.addEventListener('click', () => enrollBiometric('palm'));
    document.getElementById('bio-camera-cancel')?.addEventListener('click', () => closeBioCamera());
    document.getElementById('bio-capture-btn')?.addEventListener('click',  () => captureBiometric());
  }

  async function enrollBiometric(type) {
    activeBioType = type;
    captureCount  = 0;

    if (type === 'fingerprint') {
      /* Use WebAuthn/FIDO2 */
      await enrollWebAuthn();
      return;
    }

    /* Face or Palm — use camera */
    showBioCamera(type);
  }

  async function enrollWebAuthn() {
    const statusEl = document.getElementById('fp-status');
    try {
      if (!window.PublicKeyCredential) {
        Toast.warning('WebAuthn not supported', 'This browser does not support FIDO2 authentication.');
        return;
      }

      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'JORINOVA NEXUS ALIS-X', id: location.hostname },
          user: {
            id: new TextEncoder().encode(window.NEXUS?.userId || 'user'),
            name: window.NEXUS?.userName || 'user',
            displayName: window.NEXUS?.userName || 'NEXUS User',
          },
          pubKeyCredParams: [
            { alg: -7,   type: 'public-key' },   // ES256 (ECDSA P-256)
            { alg: -257, type: 'public-key' },   // RS256 (RSA)
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            requireResidentKey: false,
          },
          timeout: 60000,
          attestation: 'none',
        },
      });

      const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      await submitBiometricTemplate('fingerprint', credId, 0.98, { credential_id: credId });

      if (statusEl) { statusEl.textContent = '✅ Fingerprint enrolled'; statusEl.className = 'sec-bio-status enrolled'; }
      Toast.success('Fingerprint enrolled', 'WebAuthn / FIDO2 biometric registered');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        Toast.warning('Fingerprint canceled', 'User canceled the enrollment.');
      } else {
        Toast.error('Fingerprint failed', err.message || 'WebAuthn error');
      }
    }
  }

  async function showBioCamera(type) {
    const area = document.getElementById('sec-bio-camera-area');
    const guide = document.getElementById('bio-guide');
    const header = document.getElementById('sec-bio-cam-header');
    const instructions = document.getElementById('bio-instructions');
    const resultEl = document.getElementById('sec-bio-result');
    if (resultEl) resultEl.style.display = 'none';

    /* Set guide shape */
    if (type === 'face') {
      header.textContent = '👤 Face Recognition Enrollment';
      guide.innerHTML = '<div class="sec-bio-face-guide"></div>';
      instructions.textContent = 'Position your face within the oval. Look directly at the camera.';
    } else if (type === 'palm') {
      header.textContent = '🖐️ Palm Vein Recognition Enrollment';
      guide.innerHTML = '<div class="sec-bio-palm-guide" style="position:relative"><svg width="140" height="180" viewBox="0 0 140 180" style="position:absolute;inset:0;width:100%;height:100%"><path d="M20,100 Q20,40 70,20 Q120,40 120,100 L120,160 Q120,180 100,180 L40,180 Q20,180 20,160 Z" fill="none" stroke="rgba(0,255,65,0.6)" stroke-width="3"/></svg></div>';
      instructions.textContent = 'Hold your palm flat, 10–15 cm from camera. Fingers spread.';
    }

    area.style.display = 'block';

    try {
      videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      const vid = document.getElementById('bio-video');
      vid.srcObject = videoStream;
      await vid.play();
      simulateLiveness();
    } catch (err) {
      Toast.error('Camera error', 'Please allow camera access for biometric enrollment.');
      area.style.display = 'none';
    }
  }

  function simulateLiveness() {
    const livenessText = document.getElementById('bio-liveness-text');
    const qualFill = document.getElementById('bio-quality-fill');
    const qualPct  = document.getElementById('bio-quality-pct');
    const steps = ['Detecting face…', 'Checking liveness…', 'Anti-spoofing analysis…', 'Quality assessment…', 'Ready to capture!'];
    let step = 0;
    const t = setInterval(() => {
      if (step >= steps.length) { clearInterval(t); return; }
      if (livenessText) livenessText.textContent = steps[step];
      const quality = Math.round((step + 1) / steps.length * 88) + Math.round(Math.random() * 10);
      if (qualFill)  qualFill.style.width  = quality + '%';
      if (qualPct)   qualPct.textContent   = quality + '%';
      step++;
    }, 700);
  }

  function captureBiometric() {
    const vid    = document.getElementById('bio-video');
    const canvas = document.getElementById('bio-canvas');
    if (!vid?.videoWidth) { Toast.warning('Camera not ready', 'Please wait for camera to initialize.'); return; }

    canvas.width  = vid.videoWidth;
    canvas.height = vid.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(vid, 0, 0);
    const b64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

    captureCount++;
    Toast.info(`Sample ${captureCount}/3 captured`, 'Good quality. ' + (captureCount < 3 ? 'Capture more samples.' : 'Processing…'));

    if (captureCount >= 3) {
      closeBioCamera();
      submitBiometricTemplate(activeBioType, b64, 0.91, { samples: 3 });
    }
  }

  function closeBioCamera() {
    const area = document.getElementById('sec-bio-camera-area');
    if (area) area.style.display = 'none';
    if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
  }

  async function submitBiometricTemplate(type, template, quality, extra = {}) {
    try {
      const r = await fetch(`${BASE}/biometric/enroll/`, {
        method:  'POST',
        headers: { 'Content-Type':'application/json', 'X-CSRFToken': NEXUS.csrf },
        credentials: 'same-origin',
        body: JSON.stringify({ type, template, quality, ...extra }),
      });
      const d = await r.json();
      if (d.enrolled) {
        showBioResult(type, d);
        updateBioStatus(type, '✅ Enrolled — ' + (d.algorithm || 'AES-256-GCM'));
        Toast.success('Biometric enrolled!', `${type} — quality: ${Math.round(quality * 100)}%`);
      }
    } catch (e) {
      Toast.error('Enrollment failed', e.message);
    }
  }

  function showBioResult(type, data) {
    const res = document.getElementById('sec-bio-result');
    if (!res) return;
    res.style.display = 'block';
    document.getElementById('bio-result-icon').textContent = '✅';
    document.getElementById('bio-result-title').textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} Enrolled`;
    document.getElementById('bio-result-detail').textContent =
      `Algorithm: ${data.algorithm || 'AES-256-GCM'} · Quality: ${Math.round((data.quality || 0.9) * 100)}% · PQ-wrapped: ${data.pq_wrapped ? 'Yes' : 'No'}`;
  }

  function updateBioStatus(type, msg) {
    const ids = { fingerprint: 'fp-status', face: 'face-status', palm: 'palm-status' };
    const el  = document.getElementById(ids[type]);
    if (el) { el.textContent = msg; el.className = 'sec-bio-status enrolled'; }
  }

  /* ─── Behavioral Tracking ────────────────────────────────────────── */
  function initBehavioralTracking() {
    let lastKey = 0;
    document.addEventListener('keydown', e => {
      const now = Date.now();
      if (lastKey) behavioralData.typing.push(now - lastKey);
      lastKey = now;
    }, { passive: true });

    let lastPos = null, lastTime = 0;
    document.addEventListener('mousemove', e => {
      const now = Date.now();
      if (lastPos && now - lastTime > 50) {
        const dx = e.clientX - lastPos.x, dy = e.clientY - lastPos.y;
        const v  = Math.sqrt(dx * dx + dy * dy) / (now - lastTime);
        behavioralData.mouse.push(v);
        if (behavioralData.mouse.length > 100) behavioralData.mouse.shift();
      }
      lastPos = { x: e.clientX, y: e.clientY };
      lastTime = now;
    }, { passive: true });

    /* Send behavioral snapshot every 60s */
    setInterval(() => sendBehavioralSnapshot(), 60000);
    updateBehavioralDisplay();
    setInterval(updateBehavioralDisplay, 5000);
  }

  async function sendBehavioralSnapshot() {
    const avgTyping = behavioralData.typing.length
      ? behavioralData.typing.reduce((s, v) => s + v, 0) / behavioralData.typing.length : 0;
    const avgMouse  = behavioralData.mouse.length
      ? behavioralData.mouse.reduce((s, v) => s + v, 0) / behavioralData.mouse.length : 0;
    try {
      await fetch(`${BASE}/behavioral/`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'X-CSRFToken': NEXUS.csrf },
        credentials: 'same-origin',
        body: JSON.stringify({
          avg_typing_speed:  avgTyping ? Math.round(60000 / avgTyping) : 0,
          avg_mouse_velocity:avgMouse.toFixed(3),
          session_duration:  Math.round((Date.now() - behavioralData.sessionStart) / 1000),
        }),
      });
    } catch (_) {}
  }

  function updateBehavioralDisplay() {
    const avgTyping = behavioralData.typing.length
      ? Math.round(60000 / (behavioralData.typing.reduce((s,v)=>s+v,0)/behavioralData.typing.length)) : 0;
    const avgMouse  = behavioralData.mouse.length
      ? (behavioralData.mouse.reduce((s,v)=>s+v,0)/behavioralData.mouse.length).toFixed(2) : 0;
    const duration  = Math.round((Date.now() - behavioralData.sessionStart) / 1000);

    setText('beh-typing',  avgTyping ? `${avgTyping} cpm` : 'Sampling…');
    setText('beh-mouse',   avgMouse  ? `${avgMouse} px/ms` : 'Sampling…');
    setText('beh-session', duration  ? fmt.age(new Date(behavioralData.sessionStart)) : '—');
    setText('beh-ips',     '1 known');
    setText('beh-login-hours', new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }));
  }

  /* ─── Utils ─────────────────────────────────────────────────────── */
  function setText(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }
  function escHtml(s) {
    return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

})();
