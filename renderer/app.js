/* global Terminal, FitAddon, WebLinksAddon */
'use strict';

const $ = (s) => document.querySelector(s);
const PALETTE = ['#7cc576', '#9aa5d6', '#f2678a', '#f5b731', '#e0604f', '#c9925e', '#df8fc6', '#5bb4e5'];

const S = {
  projects: [],
  tabs: [],              // { id, projectId, term, fit, host, title, customTitle, process, claude, attn, lastData }
  groupOrder: [],        // projectIds in strip order
  collapsed: new Set(),
  activeId: null,
  view: 'home',
  lastActiveInProject: new Map(),
  settings: { fontSize: 13 },
  renaming: null,
  dragId: null,
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const project = (id) => S.projects.find(p => p.id === id);
const tab = (id) => S.tabs.find(t => t.id === id);
const activeTab = () => tab(S.activeId);
const tabsOf = (pid) => S.tabs.filter(t => t.projectId === pid);
const fmtK = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);
function ago(ms) {
  if (!ms) return 'never';
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
const ctxColor = (pct) => pct >= 0.9 ? 'var(--danger)' : pct >= 0.75 ? 'var(--warn)' : 'var(--ok)';
const HOME_RE = /^\/Users\/[^/]+/;
const tildify = (p) => (p || '').replace(HOME_RE, '~');

// ---------------------------------------------------------------- terminals
const THEME = {
  // Light "paper" terminal; ANSI colors darkened from the crayon palette so they read on off-white.
  background: '#fffdf8', foreground: '#4a3424', cursor: '#f2678a', cursorAccent: '#fffdf8',
  selectionBackground: '#f2678a40', selectionInactiveBackground: '#f2678a26',
  black: '#4a3424', red: '#d2463c', green: '#3f9a3a', yellow: '#b07a0c', blue: '#4f63b8', magenta: '#b0478f', cyan: '#2a8aa8', white: '#a89784',
  brightBlack: '#8a7462', brightRed: '#e0604f', brightGreen: '#5aaa4e', brightYellow: '#d4951a', brightBlue: '#6d7fd0', brightMagenta: '#c968a8', brightCyan: '#3fa6c4', brightWhite: '#d9cdb8',
};

async function openTerminal(projectId, { claude = false } = {}) {
  // The terminal sits in a card (host) inside the window: outlined in the project's color,
  // with the xterm canvas in an inner body and a "jump to latest" button in the corner.
  const host = document.createElement('div');
  host.className = 'term-host';
  host.style.setProperty('--gc', project(projectId)?.color || 'var(--accent)');
  host.innerHTML = '<div class="term-body"></div><button class="jump" title="Jump to the latest output">↓ latest</button>';
  const body = host.querySelector('.term-body');
  $('#terminals').appendChild(host);

  const term = new Terminal({
    fontFamily: '"Courier New", Courier, Menlo, monospace',
    fontWeight: 'bold',
    fontWeightBold: 'bold',
    fontSize: S.settings.fontSize || 13,
    lineHeight: 1.12,
    cursorBlink: false, // a blinking cursor redraws the terminal ~twice a second
    allowProposedApi: true,
    scrollback: 20000,
    macOptionIsMeta: false,
    theme: THEME,
    // Darken any text that would be too faint on its (softened) background.
    minimumContrastRatio: 4.5,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon.WebLinksAddon((_e, url) => window.open(url)));
  term.open(body);

  const t = { id: null, projectId, term, fit, host, title: claude ? 'claude' : null, customTitle: null, process: null, claude: null, attn: false, lastData: 0, bgFilter: createBackgroundFilter(), seenAt: Date.now() + 2500 /* ignore shell startup output */ };
  // Show the host so fit() measures real dimensions before spawning.
  host.classList.add('active');
  try { fit.fit(); } catch {}

  const { id } = await window.ide.pty.create({ projectId, cols: term.cols, rows: term.rows, command: claude ? claudeCommand() : null });
  t.id = id;
  S.tabs.push(t);
  if (!S.groupOrder.includes(projectId)) S.groupOrder.push(projectId);
  S.collapsed.delete(projectId);

  term.onData(d => window.ide.pty.write(id, d));
  term.onResize(({ cols, rows }) => window.ide.pty.resize(id, cols, rows));
  term.onTitleChange(title => { t.title = title; renderTabs(); });
  // Show the jump button whenever you've scrolled up away from the newest output.
  const updateJump = () => { const b = term.buffer.active; host.classList.toggle('scrolled-up', b.viewportY < b.baseY - 1); };
  term.onScroll(updateJump);
  term.onWriteParsed(updateJump);
  host.querySelector('.xterm-viewport')?.addEventListener('scroll', updateJump, { passive: true });
  host.querySelector('.jump').addEventListener('click', () => { term.scrollToBottom(); term.focus(); updateJump(); });
  term.attachCustomKeyEventHandler(e => {
    if (e.type !== 'keydown') return true;
    // Shift+Enter → newline in Claude Code (sends ESC+CR, same as Option+Enter).
    if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey) { window.ide.pty.write(id, '\x1b\r'); return false; }
    return !isAppShortcut(e);
  });

  // Drop files/images onto the terminal to paste their paths (Claude can read them).
  host.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); host.classList.add('drop'); } });
  host.addEventListener('dragleave', () => host.classList.remove('drop'));
  host.addEventListener('drop', e => {
    e.preventDefault(); host.classList.remove('drop');
    const paths = [...e.dataTransfer.files].map(f => window.ide.pathForFile?.(f) || f.path).filter(Boolean);
    if (paths.length) window.ide.pty.write(id, paths.map(p => /[\s'"]/.test(p) ? `'${p.replace(/'/g, `'\\''`)}'` : p).join(' ') + ' ');
    term.focus();
  });

  new ResizeObserver(() => { if (host.classList.contains('active')) { try { fit.fit(); } catch {} } }).observe(body);
  host.addEventListener('mousedown', () => { if (S.activeId !== t.id) activate(t.id); });
  activate(id);
  refreshProjects();
  return t;
}

window.ide.pty.onData((id, data) => {
  const t = tab(id);
  if (!t) return;
  t.term.write(t.bgFilter(data));
  t.lastData = Date.now();
  if (t.claude && !t.evalTimer) t.evalTimer = setTimeout(() => { t.evalTimer = null; evalAgent(t); }, 350);
});

window.ide.pty.onExit((id) => closeTab(id, { killed: true }));

function closeTab(id, { killed = false } = {}) {
  const i = S.tabs.findIndex(t => t.id === id);
  if (i < 0) return;
  const t = S.tabs[i];
  if (isFile(t)) {
    if (!confirmCloseFile(t)) return;
    disposeFile(t);
  } else {
    if (!killed) window.ide.pty.kill(id);
    t.term.dispose();
  }
  dropFromSplits(id);
  t.host.remove();
  S.tabs.splice(i, 1);
  if (!tabsOf(t.projectId).length) S.groupOrder = S.groupOrder.filter(p => p !== t.projectId);
  if (S.activeId === id) {
    const sibling = tabsOf(t.projectId)[Math.min(i, tabsOf(t.projectId).length - 1)] || tabsOf(t.projectId)[0];
    const next = sibling || S.tabs[Math.min(i, S.tabs.length - 1)];
    if (next) activate(next.id); else showHome();
  }
  renderTabs(); renderStatus(); refreshProjects();
}

function activate(id) {
  const t = tab(id);
  if (!t) return;
  S.activeId = id;
  S.view = 'term';
  S.lastActiveInProject.set(t.projectId, id);
  S.collapsed.delete(t.projectId);
  t.attn = false;
  if (t.agent === 'done') { t.agent = 'idle'; updateDockBadge(); }
  $('#home').hidden = true;
  $('#terminals').hidden = false;
  $('#home-btn').classList.remove('active');
  layoutPanes(t);
  requestAnimationFrame(() => { if (isFile(t)) t.view.focus(); else { try { t.fit.fit(); } catch {} t.term.focus(); } });
  renderTabs(); renderStatus();
  document.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function openProject(pid) {
  const last = S.lastActiveInProject.get(pid);
  if (last && tab(last)) return activate(last);
  const existing = tabsOf(pid)[0];
  if (existing) return activate(existing.id);
  return openTerminal(pid);
}

function showHome() {
  S.view = 'home';
  $('#home').hidden = false;
  $('#terminals').hidden = true;
  $('#home-btn').classList.add('active');
  renderTabs(); renderStatus(); refreshProjects();
}

// ---------------------------------------------------------------- tab strip
function tabLabel(t) {
  if (t.customTitle) return t.customTitle;
  if (isFile(t)) return t.title;
  if (t.claude) return 'claude';
  const proc = t.process;
  if (proc && !/^(zsh|bash|fish|sh|login)$/.test(proc)) return proc;
  return t.title && !/^(zsh|bash)$/.test(t.title) ? t.title : 'terminal';
}

function ring(pct, color) {
  const r = 6, c = 2 * Math.PI * r;
  return `<svg class="ring" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="${r}" fill="none" stroke="var(--bg-3)" stroke-width="2.4"/>` +
    `<circle cx="8" cy="8" r="${r}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${(pct * c).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 8 8)"/></svg>`;
}

function renderTabs() {
  if (S.renaming) return;
  const strip = $('#tabstrip');
  const active = activeTab();
  strip.innerHTML = S.groupOrder.map(pid => {
    const p = project(pid);
    const ts = tabsOf(pid);
    if (!p || !ts.length) return '';
    const collapsed = S.collapsed.has(pid);
    const hasActive = active && active.projectId === pid && S.view === 'term';
    const claudeCount = ts.filter(t => t.claude).length;
    const needs = ts.filter(t => t.agent === 'needs').length, working = ts.filter(t => t.agent === 'working').length;
    const rollup = (needs ? `<span class="chip-st needs" title="${needs} Claude${needs > 1 ? 's' : ''} waiting for you">!${needs > 1 ? needs : ''}</span>` : '') +
      (working ? `<span class="chip-st working" title="${working} Claude${working > 1 ? 's' : ''} working"><i></i>${working > 1 ? working : ''}</span>` : '');
    const chip = `<button class="group-chip" data-group="${pid}" title="${esc(p.path)}\nClick: collapse/expand · Double-click: open last tab">${esc(p.name)}` +
      (collapsed || ts.length > 1 ? `<span class="count">${ts.length}${claudeCount ? ' · ' + cc() + claudeCount : ''}</span>` : '') + rollup + `</button>`;
    const tabsHtml = collapsed ? '' : ts.map(t => {
      const isActive = active && t.id === active.id && S.view === 'term';
      const c = t.claude;
      let indicator = AGENT_BADGE[t.agent] || '';
      if (c && !c.pending && c.threshold) indicator += ring(c.pct, ctxColor(c.pct));
      else if (t.attn) indicator = '<span class="dot attn" title="New output"></span>';
      const title = isFile(t) ? esc(t.relPath) : c && !c.pending ? `${Math.round(c.pct * 100)}% of context used before auto-compact` : esc(p.path);
      return `<div class="tab ${isActive ? 'active' : ''} ${c ? 'claude' : ''} ${t.agent ? 'agent-' + t.agent : ''}" draggable="true" data-tab="${t.id}" title="${title}">` +
        `<span class="ico">${isFile(t) ? fileIcon(t.relPath) : c ? cc() : '›'}</span><span class="title">${esc(tabLabel(t))}</span>` +
        `${t.dirty ? '<span class="dirty" title="Unsaved changes (⌘S to save)">●</span>' : ''}${indicator}` +
        `<button class="close" data-close="${t.id}" title="Close (⌘W)">×</button></div>`;
    }).join('');
    const add = collapsed ? '' : `<button class="add-tab" data-add="${pid}" title="New terminal in ${esc(p.name)} (⌘T)">+</button>` +
      `<button class="add-tab files ${S.treeOpen?.[pid] ? 'on' : ''}" data-files="${pid}" title="Files (⌘B) · Quick open (⌘P)"><span class="folder-ico"></span></button>`;
    return `<div class="group ${collapsed ? 'collapsed' : ''} ${hasActive ? 'has-active' : ''}" data-gid="${pid}" style="--gc:${p.color}">${chip}${tabsHtml}${add}</div>`;
  }).join('');
}

$('#tabstrip').addEventListener('click', e => {
  const close = e.target.closest('[data-close]');
  if (close) { e.stopPropagation(); return closeTab(+close.dataset.close); }
  const add = e.target.closest('[data-add]');
  if (add) return openTerminal(add.dataset.add, { claude: e.altKey });
  const files = e.target.closest('[data-files]');
  if (files) return toggleTree(files.dataset.files);
  const chip = e.target.closest('[data-group]');
  if (chip) {
    const pid = chip.dataset.group;
    if (S.collapsed.has(pid)) { S.collapsed.delete(pid); openProject(pid); }
    else if (activeTab()?.projectId === pid || e.detail > 1) { S.collapsed.add(pid); renderTabs(); }
    else openProject(pid);
    return;
  }
  const t = e.target.closest('[data-tab]');
  if (t) activate(+t.dataset.tab);
});

$('#tabstrip').addEventListener('auxclick', e => {
  const t = e.target.closest('[data-tab]');
  if (t && e.button === 1) closeTab(+t.dataset.tab);
});

$('#tabstrip').addEventListener('dblclick', e => {
  const el = e.target.closest('[data-tab]');
  if (!el) return;
  const t = tab(+el.dataset.tab);
  S.renaming = t.id;
  const span = el.querySelector('.title');
  span.innerHTML = `<input value="${esc(tabLabel(t))}" />`;
  const input = span.querySelector('input');
  input.focus(); input.select();
  const done = (commit) => {
    if (S.renaming !== t.id) return;
    S.renaming = null;
    if (commit) t.customTitle = input.value.trim() || null;
    renderTabs(); t.term.focus();
  };
  input.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); });
  input.addEventListener('blur', () => done(true));
});

// Drag to reorder tabs within their project group.
$('#tabstrip').addEventListener('dragstart', e => {
  const el = e.target.closest('[data-tab]');
  if (!el) return;
  S.dragId = +el.dataset.tab;
  el.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});
$('#tabstrip').addEventListener('dragover', e => {
  const el = e.target.closest('[data-tab]');
  if (!el || S.dragId == null) return;
  const over = tab(+el.dataset.tab), dragged = tab(S.dragId);
  if (!over || !dragged || over.projectId !== dragged.projectId || over === dragged) return;
  e.preventDefault();
  const from = S.tabs.indexOf(dragged), to = S.tabs.indexOf(over);
  S.tabs.splice(from, 1);
  S.tabs.splice(to, 0, dragged);
  renderTabs();
  document.querySelector(`[data-tab="${S.dragId}"]`)?.classList.add('dragging');
});
$('#tabstrip').addEventListener('dragend', () => { S.dragId = null; renderTabs(); });

// ---------------------------------------------------------------- top context meter
// Shows the active tab's Claude session, or (in a plain shell tab) the Claude
// session running elsewhere in the same project, so the budget is always in view.
function meterSource() {
  if (S.view !== 'term') return null;
  const t = activeTab();
  if (!t) return null;
  if (t.claude) return { tab: t, own: true };
  const other = tabsOf(t.projectId).find(o => o.claude && !o.claude.pending) || tabsOf(t.projectId).find(o => o.claude);
  return other ? { tab: other, own: false } : null;
}

function renderMeter() {
  const top = $('#ctxtop'), line = $('#ctxline');
  const src = meterSource();
  if (!src) { top.hidden = true; line.hidden = true; return; }
  const c = src.tab.claude;
  const via = src.own ? '' : `<span class="via" title="Claude session in another tab of this project">${esc(tabLabel(src.tab))} tab</span>`;
  top.hidden = false;
  if (c.pending) {
    top.style.setProperty('--cc', 'var(--muted)');
    top.innerHTML = `<span class="lbl">${cc()} Claude</span>${via}<span class="track"><i style="width:0"></i></span><span class="num">waiting for first reply…</span>`;
    line.hidden = true;
    return;
  }
  const col = ctxColor(c.pct);
  const w = (c.pct * 100).toFixed(1) + '%';
  top.style.setProperty('--cc', col);
  top.title = `${c.used.toLocaleString()} of ~${c.threshold.toLocaleString()} tokens used before auto-compact` + (src.own ? '' : ` (${tabLabel(src.tab)} tab)`);
  top.innerHTML = `<span class="lbl">${cc()} Context</span>${via}<span class="track"><i style="width:${w}"></i></span>` +
    `<span class="num"><b>${fmtK(c.used)}</b> / ${fmtK(c.threshold)}</span><span class="pct">${Math.round(c.pct * 100)}%</span>`;
  line.hidden = false;
  line.style.setProperty('--cc', col);
  line.firstElementChild.style.width = w;
  if (!src.own) top.onclick = () => activate(src.tab.id); else top.onclick = null;
}

// Little parade of crayon animals in the empty middle of the bottom bar.
// Built once and reused so their bobbing animation doesn't restart on every status update.
let crittersHtml = null;
function critters() {
  if (!crittersHtml) {
    const row = ['flowerGreen', 'chick', 'sparkle', 'frog', 'flowerPink', 'bear', 'sparklePink']
      .map((n, i) => `<img class="critter ${n.startsWith('sparkle') ? 'tiny' : ''}" style="--i:${i}" src="${window.DOODLE_SRC(n)}" alt="" draggable="false">`).join('');
    crittersHtml = `<span class="spacer critters-wrap"><span class="critters" aria-hidden="true">${row}</span></span>`;
  }
  return crittersHtml;
}

// Crayon Claude Code creature, used wherever the UI marks something as Claude.
const cc = () => `<img class="cc" src="${window.DOODLE_SRC('claudeIcon')}" alt="" draggable="false">`;

// ---------------------------------------------------------------- agent status
// What each Claude is doing, read from the bottom of its screen (like Herdr does):
//   working — Claude shows "esc to interrupt" while thinking or running tools
//   needs   — a permission prompt or question menu is waiting for your answer
//   done    — it was working and stopped while you weren't looking (cleared when you view the tab)
//   idle    — waiting for your next prompt
const NEEDS_RE = /Do you want to |Would you like to proceed|Yes, and don.t ask again|No, and tell Claude what to do differently|Enter to (select|confirm)|❯ \d+\. /;
const WORKING_RE = /esc to interrupt/i;
const AGENT_BADGE = {
  working: '<span class="agent working" title="Claude is working"><b></b><b></b><b></b></span>',
  needs: '<span class="agent needs" title="Claude is waiting for your answer">!</span>',
  done: '<span class="agent done" title="Claude finished">✓</span>',
};

function screenTail(term, n = 22) {
  const b = term.buffer.active, end = b.baseY + term.rows, out = [];
  for (let y = Math.max(0, end - n); y < end; y++) out.push(b.getLine(y)?.translateToString(true) || '');
  return out.join('\n');
}

const lookingAt = (t) => t.id === S.activeId && S.view === 'term' && document.hasFocus() && !document.hidden;

function evalAgent(t, { quiet = false } = {}) {
  if (!t.claude) return;
  const prev = t.agent || null;
  const text = screenTail(t.term);
  let next = NEEDS_RE.test(text) ? 'needs' : WORKING_RE.test(text) ? 'working' : 'idle';
  if (next === 'idle' && (prev === 'working' || prev === 'done')) next = lookingAt(t) ? 'idle' : 'done';
  if (next === prev) return;
  t.agent = next;
  if ((next === 'needs' || next === 'done') && !lookingAt(t)) notifyAgent(t, next);
  updateDockBadge();
  if (!quiet) { renderTabs(); renderStatus(); }
}

function updateDockBadge() {
  window.ide.setBadge(S.tabs.filter(t => t.agent === 'needs').length);
}

function notifyAgent(t, kind) {
  if (kind === 'needs') window.ide.bounce();
  if (S.settings.notify === false || typeof Notification === 'undefined') return;
  const p = project(t.projectId);
  try {
    const n = new Notification(kind === 'needs' ? '✻ Claude needs you' : '✻ Claude is done', {
      body: `${p?.name || 'Project'} · ${tabLabel(t)}${kind === 'needs' ? ' is waiting for your answer' : ' finished its turn'}`,
    });
    n.onclick = () => { window.ide.focusWindow(); activate(t.id); };
  } catch {}
}

// ---------------------------------------------------------------- status bar
function renderStatus() {
  renderMeter();
  const bar = $('#statusbar');
  if (S.view === 'home') {
    const live = S.tabs.length, cl = S.tabs.filter(t => t.claude).length;
    const n = S.discovered?.length || 0;
    bar.innerHTML = `<span class="seg">${S.projects.length} projects</span><span class="seg">${live} terminal${live === 1 ? '' : 's'} open</span>` +
      (cl ? `<span class="seg">${cc()} ${cl} Claude session${cl === 1 ? '' : 's'}</span>` : '') +
      `<button class="linkbtn" data-history title="Folders you've used Claude Code in">${cc()} Claude History${n ? ` <span class="count">${n}</span>` : ''}</button>` +
      `${critters()}<span class="seg mono">⌘⇧H home · ⌃Tab next tab · ⌘⌥←/→ switch project</span>`;
    return;
  }
  const t = activeTab();
  if (!t) { bar.innerHTML = ''; return; }
  const p = project(t.projectId);
  const c = t.claude;
  // Breadcrumb of the live working directory; each segment opens that folder in Finder.
  const cwd = isFile(t) ? `${p?.path}/${t.relPath}` : (t.cwd || p?.path || '');
  const shown = tildify(cwd);
  const underHome = shown.startsWith('~');
  const parts = shown.split('/').filter(Boolean);
  let acc = underHome ? cwd.match(HOME_RE)?.[0] || '' : '';
  const crumbs = (underHome ? '' : '<span class="sep">/</span>') + parts.map((seg, i) => {
    if (!(underHome && i === 0)) acc += '/' + seg;
    const inProject = p && acc.length >= p.path.length && acc.startsWith(p.path);
    return `<button class="crumb ${i === parts.length - 1 ? 'last' : ''} ${inProject ? 'inproj' : ''}" data-dir="${esc(acc || '/')}" title="Open ${esc(acc || '/')} in Finder">${esc(seg)}</button>`;
  }).join('<span class="sep">/</span>');
  let right = '';
  if (c && !c.pending) {
    right = `<span class="seg">${fmtK(Math.max(0, c.threshold - c.used))} until auto-compact</span>` +
      (c.compactions ? `<span class="seg">compacted ${c.compactions}×</span>` : '');
  }
  bar.innerHTML = `<span class="seg"><span class="swatch" style="--gc:${p?.color}"></span><span class="proj">${esc(p?.name)}</span></span>` +
    (p?.branch ? `<span class="seg mono">⎇ ${esc(p.branch)}</span>` : '') +
    `<span class="seg path" title="${esc(cwd)}">${crumbs}</span>` +
    (isFile(t) ? `<span class="seg mono dim">${esc(t.lang)} · Ln ${t.line}, Col ${t.col}${t.dirty ? ' · <b class="unsaved">unsaved</b>' : ''}</span>`
      : `<span class="seg mono dim">${esc(t.process || '')}</span>`) + `${critters()}${right}${modelPills()}`;
}

// ---------------------------------------------------------------- model / effort
const MODELS = [
  { id: 'fable', label: 'Fable' },
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'haiku', label: 'Haiku' },
];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// "claude-opus-5-5" -> "Opus 5.5"; aliases -> capitalized.
function prettyModel(m) {
  if (!m) return null;
  const x = m.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{6,})?(\[1m\])?/i);
  if (x) return `${x[1][0].toUpperCase()}${x[1].slice(1)} ${x[2]}${x[3] ? '.' + x[3] : ''}${x[4] ? ' 1M' : ''}`;
  return m[0].toUpperCase() + m.slice(1);
}

// What the pills describe: a live Claude session, or the defaults for new Claude tabs.
function modelTarget() {
  const src = meterSource();
  if (src) {
    const t = src.tab, c = t.claude || {};
    const pend = t.pendingSwitch || {};
    // A pending /model or /effort is confirmed once Claude replies again.
    if (pend.turns != null && (c.turns || 0) > pend.turns) t.pendingSwitch = null;
    const live = t.pendingSwitch || {};
    return {
      kind: 'live', tab: t,
      model: live.model ? prettyModel(live.model) : prettyModel(c.model) || 'model…',
      effort: live.effort || c.effort || 'default',
      pendingModel: !!live.model, pendingEffort: !!live.effort,
      fullModel: c.model,
    };
  }
  return {
    kind: 'default',
    model: prettyModel(S.settings.defaultModel) || 'Default model',
    effort: S.settings.defaultEffort || 'default',
  };
}

function modelPills() {
  if (S.view !== 'term') return '';
  const m = modelTarget();
  const tip = m.kind === 'live'
    ? `Claude in the ${esc(tabLabel(m.tab))} tab${m.fullModel ? ' · ' + esc(m.fullModel) : ''}. Click to switch.`
    : 'No Claude running here: sets the model/effort for new Claude tabs.';
  const pre = m.kind === 'default' ? `<span class="dim">new ${cc()}</span>` : '';
  return `<span class="seg pills" title="${tip}">${pre}` +
    `<button class="pill" data-menu="model">${cc()} ${esc(m.model)}${m.pendingModel ? ' <i>…</i>' : ''}</button>` +
    `<button class="pill effort e-${esc(m.effort)}" data-menu="effort"><span class="bars">${effortBars(m.effort)}</span>${esc(m.effort)}${m.pendingEffort ? ' <i>…</i>' : ''}</button></span>`;
}

function effortBars(level) {
  const n = Math.max(0, EFFORTS.indexOf(level)) + (level === 'default' ? 0 : 1);
  return EFFORTS.map((_, i) => `<b class="${i < n ? 'on' : ''}"></b>`).join('');
}

function openMenu(kind, anchor) {
  closeMenu();
  const m = modelTarget();
  const items = kind === 'model'
    ? MODELS.map(x => ({ value: x.id, label: x.label, active: (m.kind === 'live' ? (m.tab.pendingSwitch?.model || (m.fullModel || '').toLowerCase()) : (S.settings.defaultModel || '')).includes(x.id) }))
    : EFFORTS.map(x => ({ value: x, label: x, active: m.effort === x, bars: effortBars(x) }));
  if (m.kind === 'default') items.push({ value: '', label: 'Claude default', active: !(kind === 'model' ? S.settings.defaultModel : S.settings.defaultEffort) });
  const menu = document.createElement('div');
  menu.id = 'popmenu';
  menu.innerHTML = `<div class="menu-head">${kind === 'model' ? 'Model' : 'Effort'} · ${m.kind === 'live' ? `this Claude session` : 'new Claude tabs'}</div>` +
    items.map(i => `<button class="menu-item ${i.active ? 'active' : ''}" data-val="${esc(i.value)}">` +
      `${i.bars ? `<span class="bars">${i.bars}</span>` : ''}<span>${esc(i.label)}</span>${i.active ? '<span class="check">✓</span>' : ''}</button>`).join('') +
    (m.kind === 'live' ? `<div class="menu-foot">Sends <code>/${kind} …</code> to Claude in that tab</div>` : '');
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  menu.style.bottom = (window.innerHeight - r.top + 6) + 'px';
  menu.addEventListener('click', async e => {
    const b = e.target.closest('[data-val]');
    if (!b) return;
    await applySwitch(kind, b.dataset.val, m);
    closeMenu();
  });
}
function closeMenu() { document.getElementById('popmenu')?.remove(); }
document.addEventListener('mousedown', e => { if (!e.target.closest('#popmenu, [data-menu]')) closeMenu(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

async function applySwitch(kind, value, m) {
  if (m.kind === 'live') {
    const t = m.tab;
    window.ide.pty.write(t.id, `/${kind} ${value}\r`);
    t.pendingSwitch = { ...(t.pendingSwitch || {}), [kind]: value, turns: t.claude?.turns || 0 };
    t.term.focus();
  } else {
    S.settings = await window.ide.settings.set({ [kind === 'model' ? 'defaultModel' : 'defaultEffort']: value || null });
  }
  renderStatus();
}

function claudeCommand() {
  let cmd = 'claude';
  if (S.settings.defaultModel) cmd += ` --model ${S.settings.defaultModel}`;
  if (S.settings.defaultEffort) cmd += ` --effort ${S.settings.defaultEffort}`;
  return cmd;
}

$('#statusbar').addEventListener('click', e => {
  const menuBtn = e.target.closest('[data-menu]');
  if (menuBtn) return document.getElementById('popmenu') ? closeMenu() : openMenu(menuBtn.dataset.menu, menuBtn);
  const dir = e.target.closest('[data-dir]')?.dataset.dir;
  if (dir) window.ide.projects.reveal(dir);
});

window.ide.onStatus(list => {
  let changed = false;
  for (const s of list) {
    const t = tab(s.id);
    if (!t) continue;
    const before = JSON.stringify([t.process, t.claude, t.attn, t.cwd, t.agent]);
    t.process = s.process;
    t.claude = s.claude;
    t.cwd = s.cwd;
    if (t.claude) evalAgent(t, { quiet: true }); else if (t.agent) { t.agent = null; updateDockBadge(); }
    // A background tab that produced output and then went quiet needs attention (e.g. Claude finished).
    if (t.id !== S.activeId && t.lastData && Date.now() - t.lastData > 1500 && t.lastData > (t.seenAt || 0)) t.attn = true;
    if (t.id === S.activeId) { t.seenAt = Date.now(); t.attn = false; }
    if (JSON.stringify([t.process, t.claude, t.attn, t.cwd, t.agent]) !== before) changed = true;
  }
  if (changed) { renderTabs(); renderStatus(); }
});

// ---------------------------------------------------------------- home
async function refreshProjects() {
  S.projects = await window.ide.projects.list();
  if (S.view === 'home') renderHome();
  renderTabs();
}

function renderHome() {
  const q = $('#search').value.trim().toLowerCase();
  const list = S.projects
    .filter(p => !q || p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q))
    .sort((a, b) => Math.max(b.lastOpened || 0, b.lastClaude || 0) - Math.max(a.lastOpened || 0, a.lastClaude || 0));
  const grid = $('#project-grid');
  if (!S.projects.length) {
    grid.innerHTML = `<div class="empty">No projects yet. Click <b>Add folder</b> or pick one from your Claude Code history below.</div>`;
  } else {
    grid.innerHTML = list.map(p => {
      const open = tabsOf(p.id).length;
      return `<div class="card ${p.exists ? '' : 'missing'}" data-open="${p.id}" style="--gc:${p.color}">
        <div class="menu"><button data-reveal="${p.id}">Finder</button><button data-remove="${p.id}">Remove</button></div>
        <div class="row"><button class="swatch" data-color="${p.id}" title="Change color"></button><span class="name">${esc(p.name)}</span>${open ? `<span class="badge">${open} open</span>` : ''}</div>
        <div class="path" title="${esc(p.path)}">‎${esc(p.path)}</div>
        <div class="meta">${p.branch ? `<span class="b">⎇ ${esc(p.branch)}</span>` : ''}<span>${cc()} ${p.claudeSessions} session${p.claudeSessions === 1 ? '' : 's'}</span><span>${p.exists ? 'active ' + ago(Math.max(p.lastOpened || 0, p.lastClaude || 0)) : 'folder missing'}</span></div>
        <div class="actions"><button class="btn sm tonal" data-term="${p.id}">› Terminal</button><button class="btn sm tonal" data-claude="${p.id}">${cc()} Claude</button></div>
      </div>`;
    }).join('') || `<div class="empty">No projects match “${esc(q)}”.</div>`;
  }
}

$('#project-grid').addEventListener('click', async e => {
  const b = (k) => e.target.closest(`[data-${k}]`)?.dataset[k];
  let id;
  if ((id = b('remove'))) { e.stopPropagation(); await window.ide.projects.remove(id); return refreshProjects(); }
  if ((id = b('reveal'))) { e.stopPropagation(); return window.ide.projects.reveal(project(id).path); }
  if ((id = b('color'))) {
    e.stopPropagation();
    const p = project(id);
    await window.ide.projects.update(id, { color: PALETTE[(PALETTE.indexOf(p.color) + 1) % PALETTE.length] });
    return refreshProjects();
  }
  if ((id = b('term'))) { e.stopPropagation(); return openTerminal(id); }
  if ((id = b('claude'))) { e.stopPropagation(); return openTerminal(id, { claude: true }); }
  if ((id = b('open'))) openProject(id);
});

// "Claude History": folders with Claude Code transcripts that aren't projects yet.
// Lives in a dialog opened from the link in the home page's bottom bar.
async function renderDiscover() {
  S.discovered = await window.ide.projects.discover();
  $('#discover').innerHTML = S.discovered.length
    ? S.discovered.map(d => `<div class="disc"><div class="info"><div class="n">${esc(d.path.split('/').pop())}</div>` +
      `<div class="p" title="${esc(d.path)}">${esc(d.path.replace(/^\/Users\/[^/]+/, '~'))} · ${d.sessions} session${d.sessions === 1 ? '' : 's'} · ${ago(d.lastUsed)}</div></div>` +
      `<button class="btn sm tonal" data-path="${esc(d.path)}">Add</button></div>`).join('')
    : `<div class="disc-empty">Nothing new here: every folder you've used Claude Code in is already a project.</div>`;
  renderStatus();
}
async function openHistory() {
  $('#discover').innerHTML = '<div class="disc-empty">Looking through your Claude history…</div>';
  $('#history-dlg').showModal();
  await renderDiscover();
}
$('#discover').addEventListener('click', async e => {
  const btn = e.target.closest('[data-path]');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Added ✓';
  await window.ide.projects.add(btn.dataset.path);
  await refreshProjects();
  setTimeout(renderDiscover, 500);
});
$('#history-close').addEventListener('click', () => $('#history-dlg').close());
$('#statusbar').addEventListener('click', e => { if (e.target.closest('[data-history]')) openHistory(); });

$('#add-btn').addEventListener('click', async () => { if (await window.ide.projects.pick()) { refreshProjects(); renderDiscover(); } });
$('#search').addEventListener('input', renderHome);
$('#home-btn').addEventListener('click', () => (S.view === 'home' && activeTab() ? activate(S.activeId) : showHome()));

// ---------------------------------------------------------------- settings
$('#settings-btn').addEventListener('click', async () => {
  const s = await window.ide.settings.get();
  $('#set-threshold').value = s.compactThreshold || '';
  $('#set-large').value = s.largeCompactThreshold || '';
  $('#set-font').value = s.fontSize || 13;
  $('#set-notify').checked = s.notify !== false;
  $('#set-threshold-hint').textContent = s.calibrated
    ? `Auto: learned ~${fmtK(s.calibrated)} from your past auto-compactions${s.calibratedLarge ? `, ~${fmtK(s.calibratedLarge)} for 1M sessions` : ''}.`
    : 'Auto: ~167k (200k window minus reserved buffer) until a compaction is observed.';
  $('#settings-dlg').showModal();
});
$('#settings-dlg').addEventListener('close', async () => {
  if ($('#settings-dlg').returnValue !== 'save') return;
  const num = (v) => (v ? +v : null);
  S.settings = await window.ide.settings.set({
    compactThreshold: num($('#set-threshold').value),
    largeCompactThreshold: num($('#set-large').value),
    fontSize: num($('#set-font').value) || 13,
    notify: $('#set-notify').checked,
  });
  for (const t of S.tabs) if (t.term) { t.term.options.fontSize = S.settings.fontSize; try { t.fit.fit(); } catch {} }
  applyEditorFont();
});

// ---------------------------------------------------------------- keyboard
function visibleOrder() { return S.groupOrder.flatMap(pid => tabsOf(pid)); }

function isAppShortcut(e) {
  const k = e.key;
  if (e.ctrlKey && k === 'Tab') return true;
  if (!e.metaKey) return false;
  if (k === 'ArrowLeft' || k === 'ArrowRight') return e.altKey;
  return ['t', 'T', 'w', 'W', 'H', 'h', '[', ']', '{', '}', 'p', 's', 'b', '\\'].includes(k) || /^[1-9]$/.test(k);
}

window.addEventListener('keydown', e => {
  if (!isAppShortcut(e) || S.renaming) return;
  const cur = activeTab();
  const pid = cur?.projectId;
  const k = e.key.toLowerCase();
  e.preventDefault();

  if (e.metaKey && k === 't') {
    const target = pid || S.projects[0]?.id;
    if (target) openTerminal(target, { claude: e.shiftKey });
  } else if (e.metaKey && k === 's') {
    if (isFile(cur)) saveFile(cur);
  } else if (e.metaKey && k === 'p') {
    quickOpen();
  } else if (e.metaKey && k === 'b') {
    toggleTree(pid);
  } else if (e.metaKey && k === '\\') {
    toggleSplit();
  } else if (e.metaKey && k === 'w') {
    if (cur && S.view === 'term') closeTab(cur.id);
  } else if (e.metaKey && e.shiftKey && k === 'h') {
    showHome();
  } else if ((e.ctrlKey && k === 'tab') || (e.metaKey && e.shiftKey && (k === ']' || k === '}' || k === '[' || k === '{'))) {
    const order = visibleOrder();
    if (!order.length) return;
    const back = e.shiftKey && k === 'tab' || k === '[' || k === '{';
    const i = Math.max(0, order.indexOf(cur));
    activate(order[(i + (back ? -1 : 1) + order.length) % order.length].id);
  } else if (e.metaKey && e.altKey && (k === 'arrowleft' || k === 'arrowright')) {
    const groups = S.groupOrder.filter(g => tabsOf(g).length);
    if (!groups.length) return;
    const i = Math.max(0, groups.indexOf(pid));
    openProject(groups[(i + (k === 'arrowright' ? 1 : -1) + groups.length) % groups.length]);
  } else if (e.metaKey && /^[1-9]$/.test(k)) {
    const pool = pid ? tabsOf(pid) : visibleOrder();
    const t = k === '9' ? pool[pool.length - 1] : pool[+k - 1];
    if (t) activate(t.id);
  }
}, true);

// ---------------------------------------------------------------- doodles
// Crayon doodles scattered around the margins of the home page (behind the
// cards), plus a couple of tiny ones in the empty part of the top bar.
const HOME_DOODLES = [
  // name, left %, top %, size px, rotation deg
  ['sun', 6, 12, 110, -8], ['flowerBlue', 93, 10, 84, 14], ['sparkle', 15, 6, 26, 0], ['sparklePink', 86, 22, 22, 0],
  ['strawberry', 4, 44, 92, -10], ['flowerGreen', 13, 30, 58, 8], ['chick', 94, 42, 104, 6],
  ['tulips', 6, 80, 120, 0], ['bear', 24, 90, 104, -6], ['butterfly', 50, 93, 84, -12], ['sparkle', 38, 84, 20, 0],
  ['apple', 72, 91, 70, 8], ['frog', 92, 80, 116, -4], ['flowerRose', 93, 61, 54, -10], ['sparkle', 64, 82, 24, 0],
  ['flowerPink', 61, 76, 44, 12], ['blob', 6, 62, 60, -14],
];

function doodle(name, cls = '') {
  return window.DOODLES?.[name] ? `<div class="doodle ${cls}"><img src="${window.DOODLE_SRC(name)}" alt="" draggable="false"></div>` : '';
}

function placeDoodles() {
  $('#doodles').innerHTML = HOME_DOODLES.map(([name, x, y, size, rot], i) =>
    doodle(name).replace('class="doodle "', `class="doodle" style="left:${x}%;top:${y}%;width:${size}px;height:${size}px;--r:${rot}deg;--dur:${5 + (i % 4)}s;--delay:-${i * 0.7}s"`)
  ).join('');
  $('#topdeco').innerHTML = doodle('flowerGreen') + doodle('sparkle', 'sm') + doodle('flowerPink');
  document.querySelectorAll('[data-doodle]').forEach(el => { el.innerHTML = window.DOODLES?.[el.dataset.doodle]?.() || ''; });
}

// ---------------------------------------------------------------- idle savings
// Pause decorative animation and background refreshes while the window isn't in front.
function updatePaused() {
  const paused = document.hidden || !document.hasFocus();
  document.body.classList.toggle('paused', paused);
}
window.addEventListener('focus', updatePaused);
window.addEventListener('blur', updatePaused);
document.addEventListener('visibilitychange', updatePaused);

// ---------------------------------------------------------------- boot
(async function boot() {
  S.settings = await window.ide.settings.get();
  placeDoodles();
  updatePaused();
  await refreshProjects();
  showHome();
  renderDiscover();
  setInterval(() => { if (S.view === 'home' && !document.body.classList.contains('paused')) refreshProjects(); }, 5000);
})();
