/**
 * JORINOVA NEXUS ALIS-X — Keyboard Shortcuts Engine + Command Palette
 * Ctrl+K: Command palette · Ctrl+F: In-page search · Ctrl+S: Save
 * Ctrl+P: Print · Ctrl+N: New entry · Ctrl+Enter: Submit/Validate
 * Alt+1/2/3: Tab switch · F2: Edit · F5: Refresh · Esc: Close dialogs
 * Context-aware · User-customizable · Voice command integration
 */
'use strict';

(function (root) {

  /* ── Command definitions ───────────────────────────────────────── */
  const COMMANDS = [
    // ── Navigation ──
    { id:'nav.dashboard',    cat:'🌐 Navigation', label:'Go to Dashboard',           icon:'🖥️', url:'/dashboard/',           keys:['Alt+D'] },
    { id:'nav.patients',     cat:'🌐 Navigation', label:'Go to Patient Hub',          icon:'🧬', url:'/patients/hub/',        keys:[] },
    { id:'nav.lab',          cat:'🌐 Navigation', label:'Go to Laboratory Worklist',  icon:'⚗️', url:'/laboratory/',          keys:[] },
    { id:'nav.reception',    cat:'🌐 Navigation', label:'Go to Reception',            icon:'📡', url:'/reception/',           keys:[] },
    { id:'nav.hematology',   cat:'🌐 Navigation', label:'Go to Hematology AI',        icon:'🔴', url:'/hematology/',          keys:[] },
    { id:'nav.bloodbank',    cat:'🌐 Navigation', label:'Go to Blood Bank',           icon:'🩸', url:'/blood-bank/',          keys:[] },
    { id:'nav.billing',      cat:'🌐 Navigation', label:'Go to Billing',              icon:'💠', url:'/billing/',             keys:[] },
    { id:'nav.quality',      cat:'🌐 Navigation', label:'Go to Quality Management',   icon:'📐', url:'/quality/',             keys:[] },
    { id:'nav.forecast',     cat:'🌐 Navigation', label:'Go to Forecast Intelligence',icon:'🔮', url:'/forecast/',            keys:[] },
    { id:'nav.inventory',    cat:'🌐 Navigation', label:'Go to Inventory',            icon:'🗂️', url:'/inventory/',           keys:[] },
    { id:'nav.reports',      cat:'🌐 Navigation', label:'Go to Reports',              icon:'📊', url:'/reports/',             keys:[] },
    { id:'nav.config',       cat:'🌐 Navigation', label:'Go to Core Configuration',   icon:'⚙️', url:'/core-config/',         keys:[] },
    // ── Patient actions ──
    { id:'patient.register', cat:'🧬 Patient',    label:'Register New Patient',        icon:'➕', action:'patient.register',  keys:[] },
    { id:'patient.search',   cat:'🧬 Patient',    label:'Search Patient',             icon:'🔍', action:'search.open',        keys:['Ctrl+K'] },
    // ── Lab actions ──
    { id:'lab.new_request',  cat:'⚗️ Laboratory', label:'New Lab Request',            icon:'🧪', url:'/reception/',           keys:['Ctrl+N'] },
    { id:'lab.worklist',     cat:'⚗️ Laboratory', label:'Open Lab Worklist',          icon:'📋', url:'/laboratory/',          keys:[] },
    // ── UI actions ──
    { id:'ui.save',          cat:'💾 Actions',    label:'Save / Validate',            icon:'💾', action:'ui.save',            keys:['Ctrl+S'] },
    { id:'ui.print',         cat:'💾 Actions',    label:'Print / Generate Label',     icon:'🖨️', action:'ui.print',           keys:['Ctrl+P'] },
    { id:'ui.refresh',       cat:'💾 Actions',    label:'Refresh Page / Reload Data', icon:'🔄', action:'ui.refresh',         keys:['F5'] },
    { id:'ui.new',           cat:'💾 Actions',    label:'New Entry',                  icon:'➕', action:'ui.new',             keys:['Ctrl+N'] },
    { id:'ui.edit',          cat:'💾 Actions',    label:'Edit Selected',              icon:'✏️', action:'ui.edit',            keys:['F2', 'Ctrl+E'] },
    { id:'ui.delete',        cat:'💾 Actions',    label:'Delete Selected',            icon:'🗑️', action:'ui.delete',          keys:['Ctrl+D'] },
    { id:'ui.undo',          cat:'💾 Actions',    label:'Undo',                       icon:'↩️', action:'ui.undo',            keys:['Ctrl+Z'] },
    { id:'ui.redo',          cat:'💾 Actions',    label:'Redo',                       icon:'↪️', action:'ui.redo',            keys:['Ctrl+Y'] },
    { id:'ui.submit',        cat:'💾 Actions',    label:'Submit / Confirm',           icon:'✅', action:'ui.submit',          keys:['Ctrl+Enter'] },
    { id:'ui.search',        cat:'💾 Actions',    label:'Search in Current List',     icon:'🔍', action:'ui.search',          keys:['Ctrl+F'] },
    // ── Tab switching ──
    { id:'tab.1',            cat:'📑 Tabs',       label:'Switch to Tab 1',            icon:'1️⃣', action:'tab.1',             keys:['Alt+1'] },
    { id:'tab.2',            cat:'📑 Tabs',       label:'Switch to Tab 2',            icon:'2️⃣', action:'tab.2',             keys:['Alt+2'] },
    { id:'tab.3',            cat:'📑 Tabs',       label:'Switch to Tab 3',            icon:'3️⃣', action:'tab.3',             keys:['Alt+3'] },
    { id:'tab.4',            cat:'📑 Tabs',       label:'Switch to Tab 4',            icon:'4️⃣', action:'tab.4',             keys:['Alt+4'] },
    { id:'tab.5',            cat:'📑 Tabs',       label:'Switch to Tab 5',            icon:'5️⃣', action:'tab.5',             keys:['Alt+5'] },
    // ── Recent ──
    { id:'recent.patients',  cat:'🕐 Recent',     label:'Recent Patients Panel',      icon:'🧬', action:'recent.toggle',      keys:['Ctrl+R'] },
    { id:'recent.search',    cat:'🕐 Recent',     label:'Search History',             icon:'🕐', action:'search.open',        keys:[] },
    // ── Shortcuts help ──
    { id:'help.shortcuts',   cat:'❓ Help',        label:'Show Keyboard Shortcuts',    icon:'⌨️', action:'help.shortcuts',     keys:['Ctrl+?', 'Ctrl+/'] },
  ];

  /* ── Custom shortcuts (user-configurable) ─────────────────────── */
  const CUSTOM_KEY = 'nexus_custom_shortcuts';
  function loadCustom() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}'); }
    catch { return {}; }
  }

  /* ── Build key → command map ──────────────────────────────────── */
  const keyMap = new Map();

  function buildKeyMap() {
    keyMap.clear();
    const custom = loadCustom();
    for (const cmd of COMMANDS) {
      const keys = custom[cmd.id] ? [custom[cmd.id]] : cmd.keys;
      for (const k of keys) {
        keyMap.set(k.toLowerCase(), cmd);
      }
    }
  }

  function normalizeKey(e) {
    const parts = [];
    if (e.ctrlKey  || e.metaKey) parts.push('ctrl');
    if (e.altKey)   parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    const k = e.key;
    if (k === 'Control' || k === 'Alt' || k === 'Shift' || k === 'Meta') return null;
    parts.push(k.length === 1 ? k.toLowerCase() : k);
    return parts.join('+');
  }

  /* ── Execute a command ────────────────────────────────────────── */
  function executeCommand(cmd) {
    if (!cmd) return;
    if (cmd.url) {
      window.location.href = cmd.url;
      return;
    }
    switch (cmd.action) {
      case 'search.open':
        window.NexusSearch?.open?.();
        break;
      case 'recent.toggle':
        window.NexusRecent?.togglePanel?.();
        break;
      case 'ui.save':
        dispatchModuleEvent('shortcut:save');
        // Also trigger submit on focused form
        document.activeElement?.form?.dispatchEvent(new Event('submit', { bubbles: true }));
        break;
      case 'ui.print':
        dispatchModuleEvent('shortcut:print');
        window.NexusSig?.autosignForPrint?.('app-main');
        setTimeout(() => window.print(), 200);
        break;
      case 'ui.refresh':
        dispatchModuleEvent('shortcut:refresh');
        break;
      case 'ui.new':
        dispatchModuleEvent('shortcut:new');
        break;
      case 'ui.edit':
        dispatchModuleEvent('shortcut:edit');
        document.activeElement?.dispatchEvent(new MouseEvent('dblclick', { bubbles:true }));
        break;
      case 'ui.delete':
        dispatchModuleEvent('shortcut:delete');
        break;
      case 'ui.undo':
        document.execCommand?.('undo');
        break;
      case 'ui.redo':
        document.execCommand?.('redo');
        break;
      case 'ui.submit':
        dispatchModuleEvent('shortcut:submit');
        document.querySelector('.btn-primary')?.click();
        break;
      case 'ui.search':
        // Focus in-page search: try to find worklist search input
        const searchEl = document.querySelector('.worklist-search, [id*=search], [id*=filter]');
        if (searchEl) { searchEl.focus(); searchEl.select(); }
        else window.NexusSearch?.open?.();
        break;
      case 'patient.register':
        window.location.href = '/patients/register/';
        break;
      case 'help.shortcuts':
        openShortcutsHelp();
        break;
      default:
        if (cmd.action?.startsWith('tab.')) {
          const tabIdx = parseInt(cmd.action.split('.')[1]) - 1;
          const tabs = document.querySelectorAll('.tab-nav .tab-btn, [role=tab]');
          tabs[tabIdx]?.click();
        }
    }
  }

  function dispatchModuleEvent(name) {
    document.dispatchEvent(new CustomEvent(name, { bubbles: true }));
  }

  /* ── Global keydown handler ───────────────────────────────────── */
  function onKeyDown(e) {
    // Never intercept when typing in input/textarea/select (except special cases)
    const target = e.target;
    const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

    const key = normalizeKey(e);
    if (!key) return;

    // Always handle Esc — close modals
    if (key === 'escape') {
      const openModal = document.querySelector('.modal-overlay[style*="flex"], .ns-overlay.open, .nr-panel.open, .cp-overlay.open');
      if (openModal) {
        e.preventDefault();
        openModal.classList.remove('open');
        openModal.style.display = '';
      }
      return;
    }

    // Ctrl+K — always open command palette
    if (key === 'ctrl+k') {
      e.preventDefault();
      openPalette();
      return;
    }

    // Ctrl+/ or Ctrl+? — shortcuts help
    if (key === 'ctrl+/' || key === 'ctrl+?') {
      e.preventDefault();
      openShortcutsHelp();
      return;
    }

    // Ctrl+R — recent patients
    if (key === 'ctrl+r' && !inInput) {
      e.preventDefault();
      window.NexusRecent?.togglePanel?.();
      return;
    }

    // Tab navigation between form fields (handled natively)
    // Only intercept non-input contexts or specific combos
    if (inInput && !e.ctrlKey && !e.altKey && !e.metaKey) return;

    const cmd = keyMap.get(key);
    if (cmd) {
      e.preventDefault();
      executeCommand(cmd);
      addToRecentCommands(cmd);
    }
  }

  /* ── Recent commands (localStorage) ──────────────────────────── */
  const RECENT_CMDS_KEY = 'nexus_recent_commands';

  function loadRecentCommands() {
    try { return JSON.parse(localStorage.getItem(RECENT_CMDS_KEY) || '[]'); }
    catch { return []; }
  }

  function addToRecentCommands(cmd) {
    const list = loadRecentCommands().filter(c => c.id !== cmd.id);
    list.unshift({ id: cmd.id, label: cmd.label, icon: cmd.icon, url: cmd.url, action: cmd.action });
    try { localStorage.setItem(RECENT_CMDS_KEY, JSON.stringify(list.slice(0, 10))); }
    catch {}
  }

  /* ════════════════════════════════════════════════════════════════
     COMMAND PALETTE (Ctrl+K)
  ════════════════════════════════════════════════════════════════ */
  let _cp, _cpInput, _cpResults, _cpSelected = -1, _cpFlat = [];

  function buildPalette() {
    if (_cp) return;
    _cp = document.createElement('div');
    _cp.id = 'cp-overlay';
    _cp.className = 'cp-overlay';
    _cp.setAttribute('role', 'dialog');
    _cp.setAttribute('aria-label', 'Command Palette');
    _cp.innerHTML = `
      <div class="cp-panel" id="cp-panel">
        <div class="cp-input-wrap">
          <span class="cp-icon">⚡</span>
          <input type="text" id="cp-input" class="cp-input"
            placeholder="Type a command, navigate, or search patients… (Ctrl+K)" autocomplete="off" spellcheck="false">
          <kbd class="cp-esc-hint">Esc</kbd>
        </div>
        <div class="cp-results" id="cp-results" role="listbox"></div>
        <div class="cp-footer">
          <span>↑↓ Navigate</span>
          <span>↵ Execute</span>
          <span>Esc Close</span>
          <span style="margin-left:auto;color:var(--text-muted)">⌨️ Ctrl+K</span>
        </div>
      </div>`;
    document.body.appendChild(_cp);
    _cpInput   = document.getElementById('cp-input');
    _cpResults = document.getElementById('cp-results');
    _cp.addEventListener('click', e => { if (e.target === _cp) closePalette(); });
    _cpInput.addEventListener('input',   () => renderPalette(_cpInput.value));
    _cpInput.addEventListener('keydown', handlePaletteKey);
  }

  function renderPalette(query) {
    const q = (query || '').toLowerCase().trim();
    _cpFlat = [];
    const groups = new Map();

    if (!q) {
      // Show recent commands + quick actions
      const recent = loadRecentCommands();
      if (recent.length) {
        groups.set('🕐 Recent Commands', recent.map(c => {
          const full = COMMANDS.find(x => x.id === c.id) || c;
          return { ...full, ...c };
        }));
      }
      // Quick actions
      const quick = COMMANDS.filter(c => c.keys.length > 0).slice(0, 8);
      if (quick.length) groups.set('⚡ Quick Actions', quick);
    } else {
      // Search commands fuzzy
      const matched = COMMANDS.filter(c =>
        c.label.toLowerCase().includes(q) ||
        c.cat.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
      // Group by category
      for (const cmd of matched) {
        if (!groups.has(cmd.cat)) groups.set(cmd.cat, []);
        groups.get(cmd.cat).push(cmd);
      }
      // Also search modules via NexusSearch
      const modulesRaw = window.NexusSearch?.searchModules?.(q) || [];
      if (modulesRaw.length) {
        groups.set('🌐 Navigate', modulesRaw.map(m => ({
          id: 'nav.' + m.url, cat:'🌐 Navigate', label: m.label, icon: m.icon, url: m.url, keys: [],
        })));
      }
    }

    if (!groups.size) {
      _cpResults.innerHTML = `<div class="cp-empty"><div style="font-size:32px">⚡</div><div>No commands found for "<strong>${esc(query)}</strong>"</div></div>`;
      _cpFlat = [];
      return;
    }

    let html = '';
    let idx = 0;
    for (const [label, items] of groups) {
      html += `<div class="cp-group-label">${esc(label)}</div>`;
      for (const cmd of items.slice(0, 6)) {
        _cpFlat.push(cmd);
        const keyHint = (cmd.keys || []).slice(0,1)[0] || '';
        html += `<div class="cp-item" data-idx="${idx}" role="option" tabindex="-1">
          <span class="cp-item-icon">${cmd.icon || '▶'}</span>
          <span class="cp-item-label">${q ? highlightCmd(cmd.label, q) : esc(cmd.label)}</span>
          <span class="cp-item-cat">${esc(cmd.cat)}</span>
          ${keyHint ? `<kbd class="cp-kbd">${esc(keyHint)}</kbd>` : ''}
        </div>`;
        idx++;
      }
    }
    _cpResults.innerHTML = html;

    _cpResults.querySelectorAll('.cp-item').forEach(el => {
      el.addEventListener('click',      () => executePaletteItem(parseInt(el.dataset.idx)));
      el.addEventListener('mouseenter', () => setCpActive(parseInt(el.dataset.idx)));
    });
    _cpSelected = -1;
  }

  function highlightCmd(text, q) {
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0,i)) + `<mark style="background:rgba(0,170,255,.25);color:var(--blue-glow);border-radius:2px">${esc(text.slice(i,i+q.length))}</mark>` + esc(text.slice(i+q.length));
  }

  function setCpActive(idx) {
    _cpResults.querySelectorAll('.cp-item').forEach(el => el.classList.remove('active'));
    const el = _cpResults.querySelector(`[data-idx="${idx}"]`);
    if (el) { el.classList.add('active'); el.scrollIntoView({ block:'nearest' }); }
    _cpSelected = idx;
  }

  function executePaletteItem(idx) {
    const cmd = _cpFlat[idx];
    if (!cmd) return;
    closePalette();
    addToRecentCommands(cmd);
    executeCommand(cmd);
  }

  function handlePaletteKey(e) {
    const n = _cpFlat.length;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setCpActive(Math.min(_cpSelected + 1, n - 1)); }
    else if (e.key === 'ArrowUp')  { e.preventDefault(); setCpActive(Math.max(_cpSelected - 1, 0)); }
    else if (e.key === 'Enter')    { e.preventDefault(); if (_cpSelected >= 0) executePaletteItem(_cpSelected); }
    else if (e.key === 'Escape')   { closePalette(); }
  }

  function openPalette() {
    buildPalette();
    _cp.classList.add('open');
    setTimeout(() => { _cpInput?.focus(); renderPalette(''); }, 50);
  }

  function closePalette() {
    _cp?.classList.remove('open');
    if (_cpInput) _cpInput.value = '';
  }

  /* ── Keyboard Shortcuts Help Overlay ─────────────────────────── */
  let _helpOverlay;

  function openShortcutsHelp() {
    if (!_helpOverlay) {
      _helpOverlay = document.createElement('div');
      _helpOverlay.id = 'ks-help-overlay';
      _helpOverlay.className = 'ks-help-overlay';
      const cats = [...new Set(COMMANDS.map(c => c.cat))];
      _helpOverlay.innerHTML = `
        <div class="ks-help-panel">
          <div class="ks-help-header">
            <span style="font-size:20px">⌨️</span>
            <div>
              <div style="font-family:var(--font-display);font-size:var(--text-lg);font-weight:700">Keyboard Shortcuts</div>
              <div style="font-size:11px;color:var(--text-muted)">NEXUS ALIS-X — Global Hotkeys</div>
            </div>
            <button class="ks-close" onclick="this.closest('.ks-help-overlay').classList.remove('open')">×</button>
          </div>
          <div class="ks-help-body">
            ${cats.map(cat => {
              const items = COMMANDS.filter(c => c.cat === cat && c.keys.length > 0);
              if (!items.length) return '';
              return `<div class="ks-group">
                <div class="ks-group-title">${esc(cat)}</div>
                ${items.map(c => `<div class="ks-item">
                  <span class="ks-label">${c.icon} ${esc(c.label)}</span>
                  <div class="ks-keys">${c.keys.map(k => `<kbd class="cp-kbd">${esc(k)}</kbd>`).join(' ')}</div>
                </div>`).join('')}
              </div>`;
            }).join('')}
          </div>
          <div class="ks-help-footer">Press <kbd class="cp-kbd">Esc</kbd> to close · <kbd class="cp-kbd">Ctrl+K</kbd> for command palette</div>
        </div>`;
      document.body.appendChild(_helpOverlay);
      _helpOverlay.addEventListener('click', e => { if (e.target === _helpOverlay) _helpOverlay.classList.remove('open'); });
    }
    _helpOverlay.classList.add('open');
  }

  /* ── Quick Actions floating panel ────────────────────────────── */
  function buildQuickActions() {
    const trigger = document.getElementById('qa-trigger-btn');
    if (!trigger) return;
    const panel = document.createElement('div');
    panel.className = 'qa-panel';
    panel.id = 'qa-panel';
    panel.innerHTML = `
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);padding:var(--space-sm) var(--space-md) 4px">⚡ Quick Actions</div>
      ${COMMANDS.filter(c => c.keys.length > 0).slice(0,8).map(c => `
        <button class="qa-item" data-cmd-id="${esc(c.id)}">
          <span class="qa-icon">${c.icon}</span>
          <span class="qa-label">${esc(c.label)}</span>
          ${c.keys[0] ? `<kbd class="cp-kbd" style="font-size:9px">${esc(c.keys[0])}</kbd>` : ''}
        </button>`).join('')}`;
    document.body.appendChild(panel);

    panel.querySelectorAll('.qa-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = COMMANDS.find(c => c.id === btn.dataset.cmdId);
        if (cmd) executeCommand(cmd);
        panel.classList.remove('open');
      });
    });

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = trigger.getBoundingClientRect();
      panel.style.top  = (r.bottom + 6) + 'px';
      panel.style.right = (window.innerWidth - r.right) + 'px';
      panel.classList.toggle('open');
    });

    document.addEventListener('click', () => panel.classList.remove('open'));
  }

  /* ── Helpers ──────────────────────────────────────────────────── */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ── Init ─────────────────────────────────────────────────────── */
  function init() {
    buildKeyMap();
    document.addEventListener('keydown', onKeyDown, true);
    buildQuickActions();

    // Ctrl+K listener (always active, even if Ctrl+K is already handled above — belt+suspenders)
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openPalette();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  /* ── Public API ────────────────────────────────────────────────── */
  root.NexusShortcuts = {
    openPalette,
    closePalette,
    openShortcutsHelp,
    executeCommand,
    COMMANDS,
  };

})(window);
