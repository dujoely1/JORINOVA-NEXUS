/**
 * JORINOVA NEXUS ALIS-X — Voice Command Engine
 * Wake word: "Hello Jorinova" / "Hey Jorinova" / "Jorinova"
 * Flow: Wake → Serial code → Voice biometric → Command
 */
'use strict';

(function (root) {

  /* ─── Browser support check ────────────────────────────────────── */
  const SpeechRecognition = root.SpeechRecognition || root.webkitSpeechRecognition;
  const SpeechSynthesis   = root.speechSynthesis;
  const AudioContext      = root.AudioContext || root.webkitAudioContext;
  if (!SpeechRecognition || !SpeechSynthesis) {
    console.warn('[Jorinova Voice] Web Speech API not supported in this browser.');
    return;
  }

  /* ─── State machine ────────────────────────────────────────────── */
  const STATE = {
    IDLE:         'idle',
    LISTENING_WAKE:'listening_wake',
    AWAITING_CODE: 'awaiting_code',
    VERIFYING:     'verifying',
    AUTHORIZED:    'authorized',
    COMMAND:       'command',
  };

  const Engine = {
    state:           STATE.IDLE,
    recognizer:      null,
    audioCtx:        null,
    mediaStream:     null,
    analyser:        null,
    voiceFingerprint:null,     /* captured audio fingerprint */
    verifiedUser:    null,     /* { user, role } after auth */
    _wakePending:    false,
    _cmdTimer:       null,
    _uiPanel:        null,
    _orbEl:          null,
    _transcriptEl:   null,

    /* ── Public: activate ────────────────────────────────────────── */
    activate() {
      if (this.state !== STATE.IDLE) {
        this._say('Voice interface already active.');
        return;
      }
      this._buildUI();
      this._startListening(STATE.LISTENING_WAKE);
    },

    deactivate() {
      this._stopListening();
      this.state = STATE.IDLE;
      this.verifiedUser = null;
      this._hideUI();
      this._updateOrb('idle');
    },

    /* ── Speech synthesis ────────────────────────────────────────── */
    _say(text, onEnd) {
      if (!SpeechSynthesis) return;
      SpeechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate  = 1.0;
      utt.pitch = 1.1;
      utt.volume = 1.0;
      /* Prefer a clear English voice */
      const voices = SpeechSynthesis.getVoices();
      const en = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('google'))
               || voices.find(v => v.lang.startsWith('en'))
               || voices[0];
      if (en) utt.voice = en;
      if (onEnd) utt.onend = onEnd;
      SpeechSynthesis.speak(utt);
      this._appendTranscript('🤖 Jorinova', text, 'system');
    },

    /* ── Speech recognition ──────────────────────────────────────── */
    _startListening(nextState) {
      this._stopListening();
      this.state = nextState;

      const rec = new SpeechRecognition();
      rec.lang           = 'en-US';
      rec.continuous     = (nextState === STATE.LISTENING_WAKE || nextState === STATE.COMMAND);
      rec.interimResults = true;
      rec.maxAlternatives = 3;
      this.recognizer    = rec;

      rec.onstart = () => {
        this._updateOrb('listening');
        if (nextState === STATE.LISTENING_WAKE) {
          this._appendTranscript('🎙️ System', 'Listening for "Hello Jorinova"…', 'hint');
        }
      };

      rec.onresult = (e) => this._handleResult(e);
      rec.onerror  = (e) => {
        if (e.error === 'not-allowed') {
          this._say('Microphone access denied. Please allow microphone in browser settings.');
          this.deactivate();
        } else if (e.error !== 'no-speech') {
          console.warn('[Jorinova Voice] Recognition error:', e.error);
        }
      };
      rec.onend = () => {
        /* Auto-restart for wake-word and command states */
        if (this.state === STATE.LISTENING_WAKE || this.state === STATE.COMMAND) {
          try { rec.start(); } catch(_) {}
        }
      };

      try { rec.start(); } catch(e) { console.warn('[Jorinova Voice] Could not start:', e); }
    },

    _stopListening() {
      if (this.recognizer) {
        try { this.recognizer.stop(); } catch(_) {}
        this.recognizer = null;
      }
    },

    /* ── Result handler ──────────────────────────────────────────── */
    _handleResult(e) {
      let final = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          for (let a = 0; a < r.length; a++) final += r[a].transcript + ' ';
        } else {
          interim += r[0].transcript;
        }
      }
      final   = final.trim().toLowerCase();
      interim = interim.trim().toLowerCase();

      const display = final || interim;
      if (display) this._updateOrbText(display);

      if (!final) return;

      switch (this.state) {
        case STATE.LISTENING_WAKE:  this._handleWake(final); break;
        case STATE.AWAITING_CODE:   this._handleSerialCode(final); break;
        case STATE.COMMAND:         this._handleCommand(final); break;
      }
    },

    /* ── Wake word detection ─────────────────────────────────────── */
    _handleWake(text) {
      const wakePatterns = [
        /hello\s+jorinova/i,
        /hey\s+jorinova/i,
        /\bjorinova\b/i,
        /hi\s+jorinova/i,
        /hello\s+genera/i,  /* misrecognition fallback */
      ];
      const matched = wakePatterns.some(p => p.test(text));
      if (!matched) return;

      this._stopListening();
      this.state = STATE.AWAITING_CODE;
      this._updateOrb('awake');
      this._appendTranscript('👤 User', text, 'user');

      /* Capture audio fingerprint for biometrics */
      this._captureAudioFingerprint();

      this._say(
        'Jorinova activated. Please state your NEXUS serial code.',
        () => this._startListening(STATE.AWAITING_CODE)
      );
      this._showUI();
      this._updateFlowStep(1);
    },

    /* ── Serial code authentication ──────────────────────────────── */
    _handleSerialCode(text) {
      this._appendTranscript('👤 User', text, 'user');
      this._stopListening();
      this.state = STATE.VERIFYING;
      this._updateOrb('verifying');
      this._updateFlowStep(2);

      /* Normalize spoken code: "J D 0 1" → "JD01", "jay dee zero one" → "JD01" */
      const code = this._normalizeSerialCode(text);
      if (!code) {
        this._say(
          'I could not understand the serial code. Please spell it out clearly, letter by letter.',
          () => {
            this.state = STATE.AWAITING_CODE;
            this._startListening(STATE.AWAITING_CODE);
          }
        );
        return;
      }

      /* API verification */
      this._verifyVoiceCode(code);
    },

    /* ── Normalize spoken serial code ────────────────────────────── */
    _normalizeSerialCode(text) {
      /* Map spoken words to characters */
      const wordMap = {
        'alpha':'A','bravo':'B','charlie':'C','delta':'D','echo':'E',
        'foxtrot':'F','golf':'G','hotel':'H','india':'I','juliet':'J',
        'kilo':'K','lima':'L','mike':'M','november':'N','oscar':'O',
        'papa':'P','quebec':'Q','romeo':'R','sierra':'S','tango':'T',
        'uniform':'U','victor':'V','whiskey':'W','xray':'X','yankee':'Y','zulu':'Z',
        'jay':'J','dee':'D','aye':'A','bee':'B','sea':'C','see':'C','ef':'F',
        'gee':'G','aitch':'H','kay':'K','el':'L','em':'M','en':'N',
        'oh':'O','pee':'P','ar':'R','es':'S','tee':'T','you':'U',
        'vee':'V','double-u':'W','ex':'X','why':'Y',
        'zero':'0','one':'1','two':'2','three':'3','four':'4',
        'five':'5','six':'6','seven':'7','eight':'8','nine':'9',
      };

      let code = text.toLowerCase()
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim();

      /* Replace word tokens */
      const tokens = code.split(/\s+/);
      const chars  = tokens.map(t => {
        if (wordMap[t])  return wordMap[t];
        if (/^\d$/.test(t)) return t;
        if (/^[a-z]$/.test(t)) return t.toUpperCase();
        return null;
      }).filter(Boolean);

      if (chars.length < 2) return null;
      return chars.join('').toUpperCase();
    },

    /* ── API verification ────────────────────────────────────────── */
    async _verifyVoiceCode(code) {
      this._say('Verifying identity, please wait.');
      try {
        const resp = await fetch('/api/v1/auth/voice-check/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': root.NEXUS?.csrf || '',
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            voice_code: code,
            fingerprint: this.voiceFingerprint,
          }),
        });
        const data = await resp.json();

        if (data.valid) {
          this._onIdentityConfirmed(data);
        } else {
          this._onIdentityFailed(data.message || 'Identity not recognized.');
        }
      } catch (err) {
        /* Demo mode fallback */
        this._onIdentityFailed('Cannot reach authentication server. Demo mode: identity assumed.');
      }
    },

    _onIdentityConfirmed(data) {
      this.verifiedUser = data;
      this.state = STATE.AUTHORIZED;
      this._updateOrb('authorized');
      this._updateFlowStep(3);
      this._updateFlowStep(4);

      const name = data.user || root.NEXUS?.userName || 'user';
      const role = data.role || '';

      if (window.NEXUS?.Toast) NEXUS.Toast.success('Identity Confirmed', `Welcome, ${name}`);

      this._say(
        `Identity confirmed. Welcome, ${name}. ${role ? 'Role: ' + role + '.' : ''} How can I assist you? You can say commands like: open dashboard, show pending tests, or critical results.`,
        () => {
          this.state = STATE.COMMAND;
          this._startListening(STATE.COMMAND);
          this._appendTranscript('🎙️ System', 'Listening for commands…', 'hint');
          /* Auto-deactivate after 5 min of no commands */
          this._resetCommandTimer();
        }
      );
    },

    _onIdentityFailed(message) {
      this.state = STATE.IDLE;
      this._updateOrb('error');
      if (window.NEXUS?.Toast) NEXUS.Toast.error('Voice Auth Failed', message);
      this._say(
        message + ' Voice interface locked. Please try again.',
        () => { this.deactivate(); }
      );
    },

    /* ── Command handler ─────────────────────────────────────────── */
    _handleCommand(text) {
      this._appendTranscript('👤 ' + (this.verifiedUser?.user || 'User'), text, 'user');
      this._resetCommandTimer();

      const cmd = text.toLowerCase();
      const ROUTES = {
        /* Navigation commands */
        'open dashboard':         '/dashboard/',
        'dashboard':              '/dashboard/',
        'show dashboard':         '/dashboard/',
        'open lab':               '/laboratory/',
        'lab worklist':           '/laboratory/',
        'show lab':               '/laboratory/',
        'open patients':          '/patients/hub/',
        'patient hub':            '/patients/hub/',
        'show patients':          '/patients/hub/',
        'register patient':       '/patients/register/',
        'open reception':         '/reception/',
        'reception':              '/reception/',
        'open phlebotomy':        '/reception/phlebotomy/',
        'phlebotomy':             '/reception/phlebotomy/',
        'collect sample':         '/reception/phlebotomy/',
        'open reports':           '/reports/',
        'show reports':           '/reports/',
        'open billing':           '/billing/',
        'billing':                '/billing/',
        'open inventory':         '/inventory/',
        'inventory':              '/inventory/',
        'open staffhub':          '/staffhub/',
        'staff hub':              '/staffhub/',
        'open genomics':          '/genomics/',
        'medgenome':              '/genomics/',
        'genomics':               '/genomics/',
        'open surveillance':      '/surveillance/',
        'epidemic':               '/surveillance/',
        'surveillance':           '/surveillance/',
        'open finaops':           '/finaops/',
        'financial operations':   '/finaops/',
        'open nexuscare':         '/nexuscare/',
        'nexuscare':              '/nexuscare/',
        'patient care':           '/nexuscare/',
        'open ai':                '/ai-nexus/',
        'ai nexus':               '/ai-nexus/',
        'open notifications':     '/notifications/',
        'notifications':          '/notifications/',
      };

      /* Check navigation */
      for (const [phrase, url] of Object.entries(ROUTES)) {
        if (cmd.includes(phrase)) {
          this._say(`Opening ${phrase}.`, () => { root.location.href = url; });
          return;
        }
      }

      /* Pending tests */
      if (cmd.includes('pending') || cmd.includes('pending test')) {
        const count = document.getElementById('stat-pending')?.textContent || '—';
        this._say(`There are currently ${count} pending tests in the laboratory.`);
        return;
      }

      /* Critical results */
      if (cmd.includes('critical') || cmd.includes('critical result')) {
        const count = document.getElementById('stat-critical')?.textContent || '—';
        this._say(`There are ${count} critical results awaiting notification.`);
        return;
      }

      /* Today's patients */
      if (cmd.includes("today's patients") || cmd.includes('patients today') || cmd.includes('how many patients')) {
        const count = document.getElementById('stat-today-patients')?.textContent || '—';
        this._say(`Today's patient count is ${count}.`);
        return;
      }

      /* Current shift */
      if (cmd.includes('current shift') || cmd.includes('which shift') || cmd.includes('what shift')) {
        const shift = document.getElementById('shift-name')?.textContent || 'unknown';
        const time  = document.getElementById('shift-time')?.textContent  || '';
        this._say(`Current shift is ${shift}. Time is ${time}.`);
        return;
      }

      /* Refresh dashboard */
      if (cmd.includes('refresh') || cmd.includes('update')) {
        this._say('Refreshing dashboard data.');
        document.getElementById('refresh-btn')?.click();
        return;
      }

      /* Sign out */
      if (cmd.includes('sign out') || cmd.includes('log out') || cmd.includes('logout')) {
        this._say('Signing you out now. Goodbye!', () => {
          document.getElementById('logout-form')?.submit();
        });
        return;
      }

      /* Lock */
      if (cmd.includes('lock') || cmd.includes('lock screen')) {
        this._say('Locking interface. Goodbye!', () => {
          this.deactivate();
          if (window.NEXUS?.InactivityEngine) NEXUS.InactivityEngine._doLogout();
        });
        return;
      }

      /* Dismiss voice */
      if (cmd.includes('stop') || cmd.includes('goodbye jorinova') || cmd.includes('bye jorinova') || cmd.includes('deactivate')) {
        this._say('Goodbye! Voice interface deactivated.', () => this.deactivate());
        return;
      }

      /* Help */
      if (cmd.includes('help') || cmd.includes('what can you do') || cmd.includes('commands')) {
        this._say('You can say: open dashboard, open lab, show pending tests, critical results, today\'s patients, current shift, refresh, sign out, or navigate to any module by name.');
        return;
      }

      /* Unrecognized */
      this._say(`I didn't understand "${text}". Please try again, or say "help" for available commands.`);
    },

    /* ── Command timeout ─────────────────────────────────────────── */
    _resetCommandTimer() {
      clearTimeout(this._cmdTimer);
      this._cmdTimer = setTimeout(() => {
        this._say('Voice session timed out due to inactivity. Say "Hello Jorinova" to reactivate.', () => {
          this.deactivate();
        });
      }, 120_000); /* 2 min command timeout */
    },

    /* ── Audio fingerprint capture ───────────────────────────────── */
    async _captureAudioFingerprint() {
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioCtx    = new AudioContext();
        const source     = this.audioCtx.createMediaStreamSource(this.mediaStream);
        this.analyser    = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        source.connect(this.analyser);

        /* Sample 10 frames over 2 seconds */
        const samples = [];
        let frame = 0;
        const buf = new Float32Array(this.analyser.frequencyBinCount);
        const sample = () => {
          if (frame++ >= 10) {
            this.voiceFingerprint = this._computeFingerprint(samples);
            return;
          }
          this.analyser.getFloatFrequencyData(buf);
          samples.push(Array.from(buf.slice(0, 32)));
          setTimeout(sample, 200);
        };
        sample();
      } catch (e) {
        /* Microphone not available for fingerprint; continue without */
        this.voiceFingerprint = null;
      }
    },

    _computeFingerprint(samples) {
      /* Simple spectral centroid fingerprint — not production biometrics but demo-ready */
      if (!samples.length) return null;
      const avg = samples[0].map((_, i) => samples.reduce((s, fr) => s + fr[i], 0) / samples.length);
      const sum  = avg.reduce((s, v) => s + Math.pow(10, v / 10), 0);
      const centroid = avg.reduce((s, v, i) => s + i * Math.pow(10, v / 10), 0) / (sum || 1);
      return { centroid: centroid.toFixed(2), bands: avg.slice(0, 8).map(v => v.toFixed(1)) };
    },

    /* ── UI ──────────────────────────────────────────────────────── */
    _buildUI() {
      if (document.getElementById('jorinova-voice-panel')) return;

      const panel = document.createElement('div');
      panel.id    = 'jorinova-voice-panel';
      panel.className = 'jv-panel glass-card';
      panel.innerHTML = `
        <div class="jv-header">
          <div class="jv-orb-mini" id="jv-orb">🎙️</div>
          <div class="jv-title-group">
            <div class="jv-title">Jorinova Voice</div>
            <div class="jv-state" id="jv-state-label">Listening for wake word…</div>
          </div>
          <button class="jv-close" id="jv-close-btn" title="Close voice panel">✕</button>
        </div>
        <div class="jv-flow" id="jv-flow" style="display:none">
          <div class="jv-step" id="jvs-1"><div class="jv-step-dot">1</div><span>Wake word</span></div>
          <div class="jv-step-line"></div>
          <div class="jv-step" id="jvs-2"><div class="jv-step-dot">2</div><span>Serial code</span></div>
          <div class="jv-step-line"></div>
          <div class="jv-step" id="jvs-3"><div class="jv-step-dot">3</div><span>Biometric</span></div>
          <div class="jv-step-line"></div>
          <div class="jv-step" id="jvs-4"><div class="jv-step-dot">4</div><span>Authorized</span></div>
        </div>
        <div class="jv-transcript" id="jv-transcript"></div>
        <div class="jv-orb-text" id="jv-orb-text"></div>`;

      document.body.appendChild(panel);
      this._uiPanel     = panel;
      this._transcriptEl= panel.querySelector('#jv-transcript');

      panel.querySelector('#jv-close-btn').addEventListener('click', () => this.deactivate());
      requestAnimationFrame(() => panel.classList.add('jv-visible'));
    },

    _showUI() {
      const flow = document.getElementById('jv-flow');
      if (flow) flow.style.display = 'flex';
    },
    _hideUI() {
      if (this._uiPanel) {
        this._uiPanel.classList.remove('jv-visible');
        setTimeout(() => this._uiPanel?.remove(), 400);
        this._uiPanel = null;
      }
    },

    _updateOrb(mode) {
      const orb   = document.getElementById('jv-orb');
      const label = document.getElementById('jv-state-label');
      const panel = document.getElementById('jorinova-voice-panel');
      if (!orb) return;
      const MAP = {
        idle:      { icon: '🎙️', label: 'Idle',                   cls: '' },
        listening: { icon: '👂',  label: 'Listening…',             cls: 'jv-listening' },
        awake:     { icon: '⚡',  label: 'Wake word detected!',    cls: 'jv-awake' },
        verifying: { icon: '🔐', label: 'Verifying identity…',    cls: 'jv-verifying' },
        authorized:{ icon: '✅', label: 'Identity confirmed!',    cls: 'jv-authorized' },
        error:     { icon: '❌', label: 'Authentication failed',  cls: 'jv-error' },
      };
      const m = MAP[mode] || MAP.idle;
      orb.textContent = m.icon;
      if (label) label.textContent = m.label;
      if (panel) {
        panel.className = 'jv-panel glass-card jv-visible ' + m.cls;
      }
    },

    _updateOrbText(text) {
      const el = document.getElementById('jv-orb-text');
      if (el) el.textContent = text;
    },

    _updateFlowStep(step) {
      for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`jvs-${i}`);
        if (!el) continue;
        el.classList.toggle('jv-step-done',   i < step);
        el.classList.toggle('jv-step-active', i === step);
      }
    },

    _appendTranscript(speaker, text, type) {
      const el = this._transcriptEl;
      if (!el) return;
      const div = document.createElement('div');
      div.className = `jv-tl jv-tl-${type}`;
      div.innerHTML = `<span class="jv-tl-spk">${speaker}:</span> <span class="jv-tl-txt">${text}</span>`;
      el.appendChild(div);
      el.scrollTop = el.scrollHeight;
      /* Also update the AI Nexus transcript if visible */
      const aiTr = document.getElementById('voice-transcript');
      if (aiTr) {
        const d2 = document.createElement('div');
        d2.className = `ai-transcript-line ${type}`;
        d2.innerHTML = `<span class="ai-tl-speaker">${speaker}:</span><span class="ai-tl-text">${text}</span>`;
        aiTr.appendChild(d2);
        aiTr.scrollTop = aiTr.scrollHeight;
      }
    },
  };

  /* ─── Global passive wake-word listener ──────────────────────── */
  /* Starts a quiet always-on recognizer that only triggers on wake word */
  function initPassiveListener() {
    if (!SpeechRecognition) return;
    const passive = new SpeechRecognition();
    passive.lang           = 'en-US';
    passive.continuous     = true;
    passive.interimResults = false;
    passive.maxAlternatives = 2;

    passive.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript.toLowerCase();
        if (/\bjorinova\b/.test(txt) && Engine.state === STATE.IDLE) {
          Engine.activate();
          break;
        }
      }
    };

    passive.onerror = () => {};
    passive.onend   = () => {
      /* Restart passive listener if engine is still idle */
      if (Engine.state === STATE.IDLE) {
        setTimeout(() => { try { passive.start(); } catch(_) {} }, 1000);
      }
    };

    /* Start after user interaction (browser requires it) */
    document.addEventListener('click', function startOnce() {
      document.removeEventListener('click', startOnce);
      try { passive.start(); } catch(_) {}
    }, { once: false });
  }

  /* ─── Boot ───────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    initPassiveListener();

    /* Wire any existing "Hello Jorinova" buttons */
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-voice-trigger], .ai-voice-trigger-btn');
      if (btn) Engine.activate();
    });
  });

  /* ─── Export ─────────────────────────────────────────────────── */
  root.JorinovaVoice = Engine;
  if (root.NEXUS) root.NEXUS.Voice = Engine;

})(window);
