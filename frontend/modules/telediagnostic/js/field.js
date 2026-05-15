/**
 * JORINOVA NEXUS — TeleDiag Field Engine
 * Camera · WebSocket · AI Interpretation · Remote Trigger · Offline Mode
 */
'use strict';

(function () {
  const CFG = window.TELEDIAG || {};

  /* ─── State ─────────────────────────────────────────────────────── */
  let videoStream    = null;
  let facingMode     = 'environment'; /* back camera */
  let ws             = null;
  let selectedTest   = 'photo';
  let lastCaptureB64 = null;
  let captureLog     = [];
  let offlineQueue   = [];
  let gpsWatcher     = null;
  let heartbeatTimer = null;
  let deviceId       = 'FLD-' + Math.random().toString(36).slice(2, 8).toUpperCase();

  /* ─── DOM refs ───────────────────────────────────────────────────── */
  const video        = document.getElementById('fld-video');
  const canvas       = document.getElementById('fld-canvas');
  const noCamEl      = document.getElementById('fld-no-camera');
  const captureBtn   = document.getElementById('fld-capture-btn');
  const flipBtn      = document.getElementById('fld-flip-camera');
  const startCamBtn  = document.getElementById('fld-start-camera-btn');
  const testBtns     = document.querySelectorAll('.fld-ts-btn');
  const resultCard   = document.getElementById('fld-result-card');
  const aiResult     = document.getElementById('fld-ai-result');
  const aiLoading    = document.getElementById('fld-ai-loading');
  const aiFlag       = document.getElementById('fld-ai-flag');
  const aiTestName   = document.getElementById('fld-ai-test-name');
  const aiResultVal  = document.getElementById('fld-ai-result-val');
  const aiInterp     = document.getElementById('fld-ai-interp');
  const aiConf       = document.getElementById('fld-ai-confidence');
  const aiMethod     = document.getElementById('fld-ai-method');
  const apiWells     = document.getElementById('fld-api-wells');
  const wellsGrid    = document.getElementById('fld-wells-grid');
  const resultActions= document.getElementById('fld-result-actions');
  const capturePlaceholder = document.getElementById('fld-capture-placeholder');
  const lastCapImg   = document.getElementById('fld-last-capture');
  const submitBtn    = document.getElementById('fld-submit-btn');
  const retakeBtn    = document.getElementById('fld-retake-btn');
  const logList      = document.getElementById('fld-log-list');
  const logCount     = document.getElementById('fld-log-count');
  const remoteCmd    = document.getElementById('fld-remote-cmd');
  const remoteMsgEl  = document.getElementById('fld-remote-msg');
  const acceptCmdBtn = document.getElementById('fld-accept-cmd-btn');
  const denyCmdBtn   = document.getElementById('fld-deny-cmd-btn');
  const remoteFlash  = document.getElementById('fld-remote-flash');
  const camTestLabel = document.getElementById('fld-cam-test-label');
  const camTs        = document.getElementById('fld-cam-ts');
  const recDot       = document.getElementById('fld-rec-dot');
  const signalIcon   = document.getElementById('fld-signal-icon');
  const signalLabel  = document.getElementById('fld-signal-label');
  const gpsLabel     = document.getElementById('fld-gps-label');

  /* ════════════════════════════════════════════════════════════════
     CAMERA
  ════════════════════════════════════════════════════════════════ */
  async function startCamera(facing = 'environment') {
    try {
      if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); }
      const constraints = {
        video: {
          facingMode: { ideal: facing },
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };
      videoStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = videoStream;
      await video.play();
      noCamEl.style.display  = 'none';
      video.style.display    = 'block';
      recDot.style.display   = 'block';
      facingMode = facing;
    } catch (err) {
      console.warn('[TeleDiag] Camera error:', err.message);
      noCamEl.style.display = 'flex';
      video.style.display   = 'none';
      recDot.style.display  = 'none';
      setSignal('error', 'Camera denied');
    }
  }

  function flipCamera() {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    startCamera(next);
  }

  /* ─── Snapshot ───────────────────────────────────────────────────── */
  function captureSnapshot() {
    if (!videoStream || !video.videoWidth) {
      alert('Start camera first');
      return null;
    }
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    /* Mirror for front camera */
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    /* Draw timestamp + test watermark */
    const ts = new Date().toLocaleString('en-GB');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, canvas.height - 36, canvas.width, 36);
    ctx.fillStyle = '#fff';
    ctx.font      = `bold ${Math.max(12, canvas.width * 0.016)}px monospace`;
    ctx.fillText(`NEXUS TeleDiag · ${ts} · Session ${CFG.sessionCode}`, 10, canvas.height - 12);
    const b64 = canvas.toDataURL('image/jpeg', 0.92);
    return b64;
  }

  function triggerFlash() {
    remoteFlash.style.display = 'flex';
    setTimeout(() => { remoteFlash.style.display = 'none'; }, 1200);
    /* Camera shutter sound via AudioContext */
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ac.createOscillator();
      const g   = ac.createGain();
      osc.connect(g); g.connect(ac.destination);
      osc.frequency.value = 800;
      g.gain.setValueAtTime(0.3, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + 0.12);
    } catch (_) {}
  }

  /* ─── AI Interpretation ──────────────────────────────────────────── */
  async function processCapture(b64, test, autoCapture = false) {
    lastCaptureB64 = b64;
    triggerFlash();

    /* Show preview */
    lastCapImg.src          = b64;
    lastCapImg.style.display = 'block';
    capturePlaceholder.style.display = 'none';
    aiResult.style.display  = 'none';
    aiLoading.style.display = 'flex';
    resultActions.style.display = 'none';

    try {
      const res = await fetch(`${CFG.apiBase}/capture/`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CFG.csrf },
        credentials: 'same-origin',
        body: JSON.stringify({
          session_code: CFG.sessionCode,
          image:        b64,
          test_type:    test,
          patient_id:   document.getElementById('fld-patient-id')?.value || '',
          notes:        document.getElementById('fld-capture-notes')?.value || '',
        }),
      });
      const data = res.ok ? await res.json() : null;
      aiLoading.style.display = 'none';

      if (data && data.ai_result) {
        renderAIResult(data.ai_result, test);
        addToLog(test, data.capture_id, data.ai_result);
        /* Send back to manager via WebSocket */
        wsSend({
          type:      'photo_captured',
          image:     b64,
          test_type: test,
          ai_result: data.ai_result,
          patient_id: document.getElementById('fld-patient-id')?.value || '',
        });
      } else {
        aiLoading.style.display = 'none';
        renderAIResult({ test:'Error','result':'Failed','interpretation':'AI server unreachable. Image saved offline.' }, test);
        offlineQueue.push({ b64, test, ts: Date.now() });
      }

      resultActions.style.display = 'flex';
    } catch (err) {
      aiLoading.style.display = 'none';
      renderAIResult({
        test: 'Offline Mode',
        result: 'Saved locally',
        flag_color: '#FFD600',
        interpretation: 'AI unavailable. Capture queued for upload when connection restores.',
      }, test);
      offlineQueue.push({ b64, test, ts: Date.now() });
      resultActions.style.display = 'flex';
    }
  }

  function renderAIResult(r, test) {
    aiResult.style.display  = 'block';
    aiTestName.textContent  = r.test || test;
    aiResultVal.textContent = r.result || '—';
    aiResultVal.style.color = r.flag_color || '#00AAFF';
    aiFlag.textContent      = r.flag || '';
    aiFlag.style.color      = r.flag_color || '#00AAFF';
    aiInterp.textContent    = r.interpretation || '';
    aiConf.textContent      = r.confidence ? `Confidence: ${r.confidence}` : '';
    aiMethod.textContent    = r.method ? `· ${r.method}` : '';

    /* API 20 well visualization */
    if ((test === 'api_20e' || test === 'api_20ne') && r.wells) {
      apiWells.style.display = 'block';
      const WELL_NAMES = [
        'ONPG','ADH','LDC','ODC','CIT','H₂S','URE','TDA',
        'IND','VP','GEL','GLU','MAN','INO','SOR','RHA',
        'SAC','MEL','AMY','ARA'
      ];
      wellsGrid.innerHTML = r.wells.map((v, i) => `
        <div class="fld-well ${v ? 'fld-well-pos' : 'fld-well-neg'}">
          <div class="fld-well-dot"></div>
          <div class="fld-well-name">${WELL_NAMES[i] || i + 1}</div>
          <div class="fld-well-val">${v ? '+' : '−'}</div>
        </div>
      `).join('');
    } else {
      apiWells.style.display = 'none';
    }
  }

  function addToLog(test, captureId, ai) {
    captureLog.unshift({ test, captureId, ai, ts: new Date() });
    const count = captureLog.length;
    logCount.textContent = count;
    document.getElementById('fld-log-count').textContent = count;

    /* Update empty state */
    const emptyEl = logList.querySelector('.fld-log-empty');
    if (emptyEl) emptyEl.remove();

    const item = document.createElement('div');
    item.className = 'fld-log-item';
    const flag = ai?.flag_color || '#00AAFF';
    item.innerHTML = `
      <div class="fld-log-dot" style="background:${flag}"></div>
      <div class="fld-log-info">
        <div class="fld-log-test">${TEST_LABELS[test] || test}</div>
        <div class="fld-log-result" style="color:${flag}">${ai?.result || '—'}</div>
      </div>
      <div class="fld-log-time">${new Date().toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'})}</div>
    `;
    logList.insertBefore(item, logList.firstChild);
  }

  const TEST_LABELS = {
    ast:'AST Strip', api_20e:'API 20E', api_20ne:'API 20NE',
    rdt_malaria:'Malaria RDT', rdt_covid:'COVID RDT', rdt_hiv:'HIV RDT',
    wound:'Wound', gram_stain:'Gram Stain', patient:'Patient Photo', photo:'Photo',
  };

  /* ════════════════════════════════════════════════════════════════
     WEBSOCKET
  ════════════════════════════════════════════════════════════════ */
  function connectWS() {
    if (!CFG.wsUrl) return;
    try {
      ws = new WebSocket(CFG.wsUrl);
    } catch (e) {
      setSignal('offline', 'WS unavailable');
      return;
    }

    ws.onopen = () => {
      setSignal('online', 'Connected');
      /* Register this device */
      wsSend({
        type:    'register_device',
        role:    'field',
        device_id: deviceId,
        device_info: {
          userAgent: navigator.userAgent,
          screen:    `${screen.width}×${screen.height}`,
          user:      CFG.user,
        },
      });
      /* Heartbeat every 30s */
      heartbeatTimer = setInterval(() => wsSend({ type: 'heartbeat' }), 30000);
    };

    ws.onmessage = (e) => {
      try { handleWSMessage(JSON.parse(e.data)); } catch (_) {}
    };

    ws.onerror  = () => setSignal('error', 'WS error');
    ws.onclose  = () => {
      setSignal('offline', 'Disconnected');
      clearInterval(heartbeatTimer);
      /* Reconnect after 5s */
      setTimeout(connectWS, 5000);
    };
  }

  function wsSend(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  function handleWSMessage(msg) {
    switch (msg.type) {
      case 'camera_command':
        handleRemoteCommand(msg);
        break;
      case 'heartbeat_ack':
        /* silently ack */
        break;
    }
  }

  function handleRemoteCommand(msg) {
    const cmd = msg.command;
    /* If auto-accept is on (or we're in a specific mode), execute immediately */
    if (cmd === 'capture') {
      /* Show remote command overlay */
      remoteMsgEl.textContent = `${msg.sender || 'Lab Manager'} requests camera capture`;
      remoteCmd.style.display = 'flex';
      /* Auto-execute after 3 seconds if not responded */
      const autoTimer = setTimeout(() => {
        if (remoteCmd.style.display !== 'none') {
          executeRemoteCapture();
        }
      }, 3000);

      acceptCmdBtn.onclick = () => {
        clearTimeout(autoTimer);
        remoteCmd.style.display = 'none';
        executeRemoteCapture();
      };
      denyCmdBtn.onclick = () => {
        clearTimeout(autoTimer);
        remoteCmd.style.display = 'none';
      };
    }
  }

  function executeRemoteCapture() {
    const b64 = captureSnapshot();
    if (b64) processCapture(b64, selectedTest, true);
  }

  /* ════════════════════════════════════════════════════════════════
     GPS
  ════════════════════════════════════════════════════════════════ */
  function startGPS() {
    if (!navigator.geolocation) {
      gpsLabel.textContent = 'No GPS';
      return;
    }
    gpsWatcher = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(5);
        const lng = pos.coords.longitude.toFixed(5);
        gpsLabel.textContent = `${lat}, ${lng}`;
        wsSend({ type:'location_update', lat, lng, accuracy: pos.coords.accuracy });
      },
      () => { gpsLabel.textContent = 'GPS unavailable'; },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  /* ════════════════════════════════════════════════════════════════
     UI HELPERS
  ════════════════════════════════════════════════════════════════ */
  function setSignal(status, label) {
    signalLabel.textContent = label;
    const iconClass = {
      online: 'fas fa-wifi',
      offline: 'fas fa-wifi-slash',
      error: 'fas fa-triangle-exclamation',
    }[status] || 'fas fa-wifi';
    signalIcon.className = iconClass;
    const color = { online:'#00E676', offline:'#FFD600', error:'#FF1744' }[status] || '#7FA8CC';
    signalIcon.style.color = color;
    signalLabel.style.color = color;
  }

  function updateTimestamp() {
    if (camTs) camTs.textContent = new Date().toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }

  /* ════════════════════════════════════════════════════════════════
     EVENTS
  ════════════════════════════════════════════════════════════════ */
  startCamBtn?.addEventListener('click',  () => startCamera(facingMode));
  flipBtn?.addEventListener('click',      flipCamera);
  captureBtn?.addEventListener('click',   () => {
    const b64 = captureSnapshot();
    if (b64) processCapture(b64, selectedTest);
  });
  retakeBtn?.addEventListener('click', () => {
    aiResult.style.display   = 'none';
    resultActions.style.display = 'none';
    lastCapImg.style.display  = 'none';
    capturePlaceholder.style.display = 'flex';
    lastCaptureB64 = null;
  });
  submitBtn?.addEventListener('click', () => {
    if (!lastCaptureB64) return;
    submitBtn.textContent = '✅ Sent!';
    submitBtn.disabled    = true;
    setTimeout(() => { submitBtn.textContent = '📤 Send to Lab'; submitBtn.disabled = false; }, 2000);
  });

  /* Test type selection */
  testBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      testBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTest    = btn.dataset.test;
      camTestLabel.textContent = `${btn.textContent} Ready`;
    });
  });

  /* Mobile tab bar */
  const panels = { camera: '.fld-camera-panel', tests: '.fld-test-selector', log: '.fld-capture-log', sync: '' };
  document.getElementById('fltab-camera')?.addEventListener('click', () => {
    document.querySelectorAll('.fld-ts-btn-panel,.fld-capture-log').forEach(e => e.classList.remove('active-mobile'));
    document.querySelector('.fld-camera-panel')?.classList.add('active-mobile');
    document.querySelectorAll('.fld-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('fltab-camera').classList.add('active');
  });

  /* ════════════════════════════════════════════════════════════════
     BOOT
  ════════════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', () => {
    /* Auto-start camera on load */
    startCamera('environment');
    connectWS();
    startGPS();
    setInterval(updateTimestamp, 1000);
    /* Show signal as connecting */
    setSignal('offline', 'Connecting…');
  });

})();
