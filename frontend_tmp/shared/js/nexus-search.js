/**
 * JORINOVA NEXUS ALIS-X — Global Search Engine
 * Unified search · Autocomplete · Predictive suggestions · AI-powered filtering
 * Recent searches memory · Cross-module search · Keyboard navigable
 */
'use strict';

(function (root) {

  /* ── Constants ─────────────────────────────────────────────────── */
  const MAX_HISTORY    = 20;
  const MAX_SUGGESTIONS= 8;
  const DEBOUNCE_MS    = 220;
  const MIN_CHARS      = 2;
  const STORAGE_KEY    = 'nexus_search_history';

  /* ── Search categories configuration ──────────────────────────── */
  const SEARCH_CATEGORIES = [
    { id:'patients',    label:'Patients',       icon:'🧬', url:'/api/v1/patients/',     fields:['full_name','pid','lid'],       color:'var(--blue-glow)' },
    { id:'lab',         label:'Lab Requests',   icon:'⚗️', url:'/api/v1/lab/requests/', fields:['lab_id','patient_name'],      color:'var(--alert-red)' },
    { id:'blood_bank',  label:'Blood Bank',     icon:'🩸', url:null,                    fields:['bag_number','blood_group'],   color:'#E74C3C' },
    { id:'inventory',   label:'Inventory',      icon:'📦', url:'/api/v1/inventory/items/', fields:['name','code'],            color:'var(--alert-orange)' },
    { id:'modules',     label:'Modules',        icon:'🌐', url:null,                    fields:['name'],                       color:'var(--cyan)' },
  ];

  /* ── Module navigation shortcuts (for "Go to" search) ─────────── */
  const MODULE_NAV = [
    { name:'Dashboard',           url:'/dashboard/',           icon:'🖥️', tags:['home','overview','stats'] },
    { name:'Patient Hub',         url:'/patients/hub/',        icon:'🧬', tags:['patient','register'] },
    { name:'Reception',           url:'/reception/',           icon:'📡', tags:['reception','new request','admit'] },
    { name:'Laboratory Worklist', url:'/laboratory/',          icon:'⚗️', tags:['lab','tests','worklist'] },
    { name:'Hematology AI',       url:'/hematology/',          icon:'🔴', tags:['cbc','blood count','anemia'] },
    { name:'Blood Bank',          url:'/blood-bank/',          icon:'🩸', tags:['blood','crossmatch','donor'] },
    { name:'Serology',            url:'/laboratory/serology/', icon:'🔬', tags:['hiv','hepatitis','serology'] },
    { name:'Microbiology AI',     url:'/micro-ai/',            icon:'🦠', tags:['culture','gram','microbiology'] },
    { name:'Toxicology',          url:'/toxicology/',          icon:'☠️', tags:['drug','poison','tdm'] },
    { name:'Anatomical Pathology',url:'/pathology/',           icon:'🩺', tags:['biopsy','histology','ihc'] },
    { name:'Quality Management',  url:'/quality/',             icon:'📐', tags:['iqc','eqa','sop','capa'] },
    { name:'IoT Analyzers',       url:'/iot-analyzers/',       icon:'🔧', tags:['analyzer','device','calibration'] },
    { name:'Billing',             url:'/billing/',             icon:'💠', tags:['invoice','payment','momo'] },
    { name:'Inventory',           url:'/inventory/',           icon:'🗂️', tags:['stock','reagent','expiry'] },
    { name:'Reports',             url:'/reports/',             icon:'🔮', tags:['analytics','report','statistics'] },
    { name:'StaffHub',            url:'/staffhub/',            icon:'👥', tags:['staff','timetable','leave'] },
    { name:'FinaOps',             url:'/finaops/',             icon:'💰', tags:['finance','revenue','momo'] },
    { name:'Surveillance',        url:'/surveillance/',        icon:'🔭', tags:['outbreak','disease','epidemic'] },
    { name:'Forecast',            url:'/forecast/',            icon:'🔮', tags:['predict','forecast','ai'] },
    { name:'Interoperability',    url:'/interoperability/',    icon:'🔗', tags:['hl7','fhir','moh','rbc'] },
    { name:'Specimen Tracking',   url:'/specimen-tracking/',   icon:'🏷️', tags:['barcode','label','sample'] },
    { name:'Doctor Portal',       url:'/doctor-portal/',       icon:'🩺', tags:['doctor','results','portal'] },
    { name:'Core Config',         url:'/core-config/',         icon:'⚙️', tags:['settings','hospital','config'] },
    { name:'Audit Trail',         url:'/audit-trail/',         icon:'🕵️', tags:['audit','security','log'] },
  ];

  /* ── AI suggestion patterns ────────────────────────────────────── */
  const AI_PATTERNS = [
    { rx:/^(find|search|look)\s+(.+)/i,  suggest:(m) => `Search for patient: "${m[2]}"` },
    { rx:/^(go|open|navigate)\s+(.+)/i, suggest:(m) => `Navigate to: ${m[2]}` },
    { rx:/^(new|add|register)\s+patient/i, suggest:() => 'Register new patient' },
    { rx:/^(new|create)\s+(lab|test|request)/i, suggest:() => 'New lab request' },
    { rx:/^(print|generate)\s+(label|barcode)/i, suggest:() => 'Print specimen labels' },
    { rx:/^(crossmatch|cross match)/i, suggest:() => 'Blood bank crossmatch' },
    { rx:/^(report|export)/i, suggest:() => 'Generate report' },
    { rx:/^([A-Z]{3,}-\d{4,})/,          suggest:(m) => `Lab ID lookup: ${m[1]}` },
    { rx:/^\d{7}$/,                       suggest:(m) => `Unique Lab ID: ${m[0]}` },
    { rx:/^(PID|NXS-LID)-/i,             suggest:(m) => `Patient lookup: ${m[0]}` },
  ];

  /* ── History management (localStorage) ────────────────────────── */
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function saveHistory(hist) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(hist.slice(0, MAX_HISTORY))); }
    catch {}
  }

  function addToHistory(query, result) {
    if (!query || query.length < MIN_CHARS) return;
    const hist  = loadHistory().filter(h => h.query !== query);
    const entry = {
      query,
      result_type: result?.type || 'search',
      result_label: result?.label || query,
      result_url:   result?.url  || null,
      timestamp:    Date.now(),
    };
    saveHistory([entry, ...hist]);
  }

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /* ── Fuzzy match score ────────────────────────────────────────── */
  function fuzzyScore(text, query) {
    text  = (text || '').toLowerCase();
    query = (query || '').toLowerCase();
    if (text === query)             return 100;
    if (text.startsWith(query))     return 90;
    if (text.includes(query))       return 70;
    // Subsequence match
    let qi = 0;
    for (let i = 0; i < text.length && qi < query.length; i++) {
      if (text[i] === query[qi]) qi++;
    }
    if (qi === query.length) return 50;
    return 0;
  }

  function highlightMatch(text, query) {
    if (!query) return esc(text);
    const idx = (text || '').toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return esc(text);
    return esc(text.slice(0, idx))
         + `<mark style="background:rgba(0,170,255,.25);color:var(--blue-glow);border-radius:2px">${esc(text.slice(idx, idx + query.length))}</mark>`
         + esc(text.slice(idx + query.length));
  }

  /* ── Module navigation search ─────────────────────────────────── */
  function searchModules(query) {
    const q = query.toLowerCase();
    return MODULE_NAV
      .map(m => {
        const scores = [
          fuzzyScore(m.name, q),
          ...m.tags.map(t => fuzzyScore(t, q)),
        ];
        return { ...m, score: Math.max(...scores) };
      })
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(m => ({
        type:    'module',
        icon:    m.icon,
        label:   m.name,
        url:     m.url,
        score:   m.score,
        html:    `${m.icon} <span class="ns-result-label">${highlightMatch(m.name, query)}</span> <span class="ns-result-meta">Go to module</span>`,
      }));
  }

  /* ── History search ────────────────────────────────────────────── */
  function searchHistory(query) {
    const q   = query.toLowerCase();
    const hist= loadHistory();
    return hist
      .filter(h => fuzzyScore(h.query, q) > 0 || fuzzyScore(h.result_label, q) > 0)
      .slice(0, 4)
      .map(h => ({
        type:  'history',
        icon:  '🕐',
        label: h.query,
        url:   h.result_url,
        score: 60,
        timestamp: h.timestamp,
        html:  `🕐 <span class="ns-result-label">${highlightMatch(h.query, query)}</span> <span class="ns-result-meta">Recent search</span>`,
      }));
  }

  /* ── AI pattern suggestions ───────────────────────────────────── */
  function aiSuggestions(query) {
    const results = [];
    for (const p of AI_PATTERNS) {
      const m = query.match(p.rx);
      if (m) {
        results.push({
          type:  'ai_suggestion',
          icon:  '🤖',
          label: p.suggest(m),
          url:   null,
          score: 85,
          html:  `🤖 <span class="ns-result-label">${esc(p.suggest(m))}</span> <span class="ns-result-meta" style="color:#A855F7">AI Suggestion</span>`,
        });
      }
    }
    return results.slice(0, 2);
  }

  /* ── API patient search ───────────────────────────────────────── */
  async function searchAPI(query) {
    const api = window.NEXUS?.apiBase || '/api/v1';
    const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
    try {
      const r = await fetch(`${api}/patients/?search=${encodeURIComponent(query)}&limit=5`, {
        headers: { 'X-CSRFToken': csrf },
      });
      if (!r.ok) return [];
      const data = await r.json();
      const results = (data.results || data).slice(0, 5);
      return results.map(p => ({
        type:   'patient',
        icon:   '🧬',
        label:  p.full_name || `${p.family_name} ${p.other_names}`,
        sub:    `${p.pid || ''} · ${p.age || ''} ${p.gender || ''}`,
        url:    `/patients/hub/?pid=${p.pid}`,
        score:  80,
        pid:    p.pid,
        lid:    p.lid,
        html:   `🧬 <span class="ns-result-label">${highlightMatch(p.full_name || p.family_name, query)}</span> <span class="ns-result-meta">${esc(p.pid||'')} · ${esc(p.age||'')} ${esc(p.gender||'')}</span>`,
      }));
    } catch {
      return [];
    }
  }

  /* ── Combined search ────────────────────────────────────────────── */
  async function search(query) {
    if (!query || query.length < MIN_CHARS) return { groups: [], query };

    const [modules, history, api, aiHints] = await Promise.all([
      Promise.resolve(searchModules(query)),
      Promise.resolve(searchHistory(query)),
      searchAPI(query),
      Promise.resolve(aiSuggestions(query)),
    ]);

    const groups = [];
    if (aiHints.length)  groups.push({ label:'🤖 AI Suggestions',  items: aiHints });
    if (api.length)      groups.push({ label:'🧬 Patients',         items: api });
    if (modules.length)  groups.push({ label:'🌐 Navigate to…',     items: modules });
    if (history.length)  groups.push({ label:'🕐 Recent Searches',  items: history });
    return { groups, query };
  }

  /* ── UI: Search Overlay ────────────────────────────────────────── */
  let _overlay, _input, _results, _debTimer, _selectedIdx = -1, _flatItems = [];

  function buildOverlay() {
    if (_overlay) return;
    _overlay = document.createElement('div');
    _overlay.id = 'ns-overlay';
    _overlay.className = 'ns-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', 'NEXUS Global Search');
    _overlay.innerHTML = `
      <div class="ns-panel" id="ns-panel">
        <div class="ns-input-wrap">
          <span class="ns-search-icon">🔍</span>
          <input type="text" id="ns-input" class="ns-input" placeholder="Search patients, lab IDs, navigate modules… (Esc to close)" autocomplete="off" spellcheck="false">
          <span class="ns-shortcut-hint">Ctrl+K</span>
        </div>
        <div class="ns-filter-row" id="ns-filter-row">
          <button class="ns-filter-chip active" data-filter="">All</button>
          <button class="ns-filter-chip" data-filter="patient">🧬 Patients</button>
          <button class="ns-filter-chip" data-filter="module">🌐 Modules</button>
          <button class="ns-filter-chip" data-filter="history">🕐 History</button>
        </div>
        <div class="ns-results" id="ns-results" role="listbox"></div>
        <div class="ns-footer">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
          <button class="ns-clear-history" id="ns-clear-history">🗑️ Clear history</button>
        </div>
      </div>`;
    document.body.appendChild(_overlay);

    _input   = document.getElementById('ns-input');
    _results = document.getElementById('ns-results');

    _overlay.addEventListener('click', e => { if (e.target === _overlay) close(); });
    _input.addEventListener('input',   debounceSearch);
    _input.addEventListener('keydown', handleKey);
    document.getElementById('ns-clear-history')?.addEventListener('click', () => {
      clearHistory();
      renderEmpty(_input.value || '');
    });
    document.querySelectorAll('.ns-filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ns-filter-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        triggerSearch();
      });
    });
  }

  function renderEmpty(query) {
    const hist = loadHistory().slice(0, 5);
    if (!query && hist.length) {
      _results.innerHTML = `
        <div class="ns-group-label">🕐 Recent Searches</div>
        ${hist.map((h, i) => `
          <div class="ns-result-item" data-idx="${i}" data-url="${esc(h.result_url || '')}" tabindex="0" role="option">
            🕐 <span class="ns-result-label">${esc(h.query)}</span>
            <span class="ns-result-meta">${timeAgo(h.timestamp)}</span>
          </div>`).join('')}`;
      _flatItems = hist.map(h => ({ url: h.result_url, label: h.query }));
    } else if (!query) {
      _results.innerHTML = `
        <div class="ns-empty">
          <div style="font-size:40px">🔍</div>
          <div>Search patients, lab IDs, modules…</div>
          <div style="font-size:11px;opacity:.5;margin-top:4px">Type at least ${MIN_CHARS} characters</div>
        </div>`;
      _flatItems = [];
    }
    _selectedIdx = -1;
  }

  function renderResults(result) {
    const { groups, query } = result;
    if (!groups.length) {
      _results.innerHTML = `<div class="ns-empty"><div style="font-size:36px">🔍</div><div>No results for "<strong>${esc(query)}</strong>"</div></div>`;
      _flatItems = [];
      return;
    }

    let html = '';
    _flatItems = [];
    let globalIdx = 0;

    for (const group of groups) {
      html += `<div class="ns-group-label">${esc(group.label)}</div>`;
      for (const item of group.items) {
        const idx = globalIdx++;
        _flatItems.push(item);
        html += `<div class="ns-result-item" data-idx="${idx}" data-url="${esc(item.url || '')}" role="option" tabindex="-1">
          ${item.html}
        </div>`;
      }
    }
    _results.innerHTML = html;

    _results.querySelectorAll('.ns-result-item').forEach(el => {
      el.addEventListener('click', () => selectItem(parseInt(el.dataset.idx)));
      el.addEventListener('mouseenter', () => setActive(parseInt(el.dataset.idx)));
    });
    _selectedIdx = -1;
  }

  function setActive(idx) {
    _results.querySelectorAll('.ns-result-item').forEach(el => el.classList.remove('active'));
    const el = _results.querySelector(`[data-idx="${idx}"]`);
    if (el) { el.classList.add('active'); el.scrollIntoView({ block: 'nearest' }); }
    _selectedIdx = idx;
  }

  function selectItem(idx) {
    const item = _flatItems[idx];
    if (!item) return;
    if (item.url) {
      addToHistory(_input.value, item);
      close();
      window.location.href = item.url;
    } else if (item.type === 'ai_suggestion') {
      _input.value = item.label.replace(/^(Search for patient: |Navigate to: )/, '');
      triggerSearch();
    }
  }

  function handleKey(e) {
    const count = _flatItems.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(_selectedIdx + 1, count - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(_selectedIdx - 1, 0)); }
    else if (e.key === 'Enter')  { e.preventDefault(); if (_selectedIdx >= 0) selectItem(_selectedIdx); else if (_input.value) submitSearch(_input.value); }
    else if (e.key === 'Escape') { close(); }
  }

  function debounceSearch() {
    clearTimeout(_debTimer);
    _debTimer = setTimeout(triggerSearch, DEBOUNCE_MS);
  }

  async function triggerSearch() {
    const q = _input?.value?.trim() || '';
    if (q.length < MIN_CHARS) { renderEmpty(q); return; }
    const result = await search(q);
    const activeFilter = document.querySelector('.ns-filter-chip.active')?.dataset?.filter;
    if (activeFilter) {
      result.groups = result.groups.filter(g =>
        activeFilter === 'patient' ? g.label.includes('Patient') :
        activeFilter === 'module'  ? g.label.includes('Navigate') :
        activeFilter === 'history' ? g.label.includes('Recent') :
        true
      );
    }
    renderResults(result);
  }

  function submitSearch(query) {
    addToHistory(query, null);
    window.location.href = `/patients/hub/?search=${encodeURIComponent(query)}`;
    close();
  }

  function open() {
    buildOverlay();
    _overlay.classList.add('open');
    setTimeout(() => _input?.focus(), 50);
    renderEmpty('');
  }

  function close() {
    _overlay?.classList.remove('open');
  }

  /* ── Helpers ──────────────────────────────────────────────────── */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function timeAgo(ts) {
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return 'just now';
    if (d < 3600) return `${Math.floor(d/60)}m ago`;
    if (d < 86400) return `${Math.floor(d/3600)}h ago`;
    return `${Math.floor(d/86400)}d ago`;
  }

  /* ── Public API ────────────────────────────────────────────────── */
  root.NexusSearch = { open, close, addToHistory, clearHistory, searchModules, search };

})(window);
