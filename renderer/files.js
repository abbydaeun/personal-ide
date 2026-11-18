/* global CM */
// File editing: file tabs (CodeMirror), the project file tree, quick open (⌘P),
// the side-by-side split with a terminal (⌘\), and live reload of files that
// change on disk, with Claude's edits highlighted.
// Shares globals with app.js (S, tab, project, activate, renderTabs, renderStatus, esc, $ …).
'use strict';

let nextFileId = -1; // file tabs use negative ids so they never collide with terminal ids
const isFile = (t) => t && t.kind === 'file';
const baseName = (rel) => rel.split('/').pop();

// Crayon icons per file type (mostly puns: py -> pie, md -> band-aid, yaml -> yam…); others get a plain page.
const FILE_ICONS = {
  py: 'pieIcon', pyi: 'pieIcon',                                   // py -> pie
  md: 'bandaidIcon', markdown: 'bandaidIcon', mdx: 'bandaidIcon',   // MD -> band-aid
  json: 'bracesIcon', jsonl: 'bracesIcon',
  ipynb: 'notebookIcon',
  txt: 'paperIcon', log: 'paperIcon', text: 'paperIcon',
  csv: 'blanketIcon', tsv: 'blanketIcon',                           // a grid, like gingham
  yaml: 'yamIcon', yml: 'yamIcon',                                  // yam-l
  sh: 'seashellIcon', bash: 'seashellIcon', zsh: 'seashellIcon', fish: 'seashellIcon',
  js: 'coffeeIcon', mjs: 'coffeeIcon', cjs: 'coffeeIcon', jsx: 'coffeeIcon', // java-script
  ts: 'teacupIcon', tsx: 'teacupIcon', mts: 'teacupIcon', cts: 'teacupIcon', // tea-script
  html: 'houseIcon', htm: 'houseIcon',
  css: 'paletteIcon', scss: 'paletteIcon', sass: 'paletteIcon', less: 'paletteIcon',
  toml: 'tomatoIcon',
  rs: 'crabIcon',
  png: 'frameIcon', jpg: 'frameIcon', jpeg: 'frameIcon', gif: 'frameIcon', svg: 'frameIcon', webp: 'frameIcon', ico: 'frameIcon', heic: 'frameIcon',
  pdf: 'letterIcon',
};
// Whole-name matches (dotfiles)
const NAME_ICONS = { '.gitignore': 'eyeIcon', '.dockerignore': 'eyeIcon', '.npmignore': 'eyeIcon' };
function fileIcon(rel) {
  const name = baseName(rel), lower = name.toLowerCase(), ext = name.includes('.') ? lower.split('.').pop() : '';
  const doodle = NAME_ICONS[lower] || (lower === '.env' || lower.startsWith('.env.') ? 'padlockIcon' : FILE_ICONS[ext]);
  return doodle && window.DOODLES?.[doodle]
    ? `<img class="fi" src="${window.DOODLE_SRC(doodle)}" alt="" draggable="false">`
    : '<span class="file-ico"></span>';
}

// ------------------------------------------------------------- editor look
const paperTheme = CM.EditorView.theme({
  '&': { height: '100%', backgroundColor: '#fffdf8', color: '#4a3424' },
  '.cm-scroller': { fontFamily: '"Courier New", Courier, Menlo, monospace', fontWeight: 'bold', lineHeight: '1.5' },
  '.cm-content': { caretColor: '#f2678a', padding: '10px 0' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-cursor': { borderLeftColor: '#f2678a', borderLeftWidth: '2px' },
  '.cm-gutters': { backgroundColor: '#fffdf8', color: '#c9b9a4', border: 'none', paddingLeft: '6px' },
  '.cm-activeLine': { backgroundColor: '#fbf5e8' },
  '.cm-activeLineGutter': { backgroundColor: '#fbf5e8', color: '#8a7462' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#f2678a38 !important' },
  '.cm-searchMatch': { backgroundColor: '#ffe9a8', outline: '1px solid #f5c76b' },
  '.cm-selectionMatch': { backgroundColor: '#f6e9ce' },
  '.cm-matchingBracket': { backgroundColor: '#def2d6', outline: 'none' },
  '.cm-foldGutter span': { color: '#c9b9a4' },
  '.cm-panels': { backgroundColor: '#f5efe2', color: '#4a3424', fontFamily: '"Courier New", Courier, monospace' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1.5px solid #e6dccb' },
  '.cm-textfield': { borderRadius: '8px', border: '1.5px solid #e6dccb', background: '#fff' },
  '.cm-button': { borderRadius: '999px', border: '1.5px solid #e6dccb', backgroundImage: 'none', background: '#fff' },
  '.cm-tooltip': { background: '#fff', border: '1.5px solid #e6dccb', borderRadius: '10px' },
});

// Syntax colors drawn from the crayon palette (darkened to read on paper).
const T = CM.tags;
const paperHighlight = CM.HighlightStyle.define([
  { tag: [T.keyword, T.controlKeyword, T.operatorKeyword, T.definitionKeyword, T.moduleKeyword], color: '#b0478f' },
  { tag: [T.string, T.special(T.string), T.regexp], color: '#3f8a3a' },
  { tag: [T.number, T.bool, T.null, T.atom], color: '#4f63b8' },
  { tag: [T.comment, T.lineComment, T.blockComment, T.docComment], color: '#a89784', fontStyle: 'italic' },
  { tag: [T.function(T.variableName), T.function(T.definition(T.variableName)), T.function(T.propertyName)], color: '#c2571f' },
  { tag: [T.className, T.typeName, T.namespace], color: '#2a8aa8' },
  { tag: [T.propertyName, T.attributeName], color: '#a8700c' },
  { tag: [T.tagName], color: '#b0478f' },
  { tag: [T.self, T.special(T.variableName)], color: '#b0478f' },
  { tag: T.heading, color: '#e04f76', fontWeight: 'bold' },
  { tag: T.emphasis, fontStyle: 'italic' },
  { tag: T.strong, fontWeight: 'bold', color: '#3a2818' },
  { tag: [T.link, T.url], color: '#4f63b8', textDecoration: 'underline' },
  { tag: [T.monospace], color: '#2a8aa8' },
  { tag: [T.quote], color: '#8a7462' },
  { tag: [T.list], color: '#d4951a' },
  { tag: T.invalid, color: '#d2463c' },
]);

// "Changed by Claude" line highlights: a StateField of line decorations that fade out.
const setChanged = CM.StateEffect.define();
const changedLines = CM.StateField.define({
  create: () => CM.Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setChanged)) deco = e.value;
    return deco;
  },
  provide: f => CM.EditorView.decorations.from(f),
});
const changedLineDeco = CM.Decoration.line({ class: 'cm-claude-changed' });

// Which lines of the new text are new or changed? A real line diff (LCS) so only the lines
// Claude touched glow; falls back to a single span for very large files.
function changedLineNumbers(oldText, newText) {
  const a = oldText.split('\n'), b = newText.split('\n');
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const A = a.slice(p, a.length - s), B = b.slice(p, b.length - s);
  if (!B.length) return [Math.min(p + 1, b.length)]; // pure deletion: mark where it happened
  if (A.length * B.length > 4e6) return B.map((_, i) => p + 1 + i);
  const n = A.length, m = B.length, dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (j < m) {
    if (i < n && A[i] === B[j]) { i++; j++; }
    else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) i++;
    else { out.push(p + 1 + j); j++; }
  }
  return out.length ? out : [Math.min(p + 1, b.length)];
}

// ------------------------------------------------------------- open / save
async function openFile(pid, rel, { focus = true } = {}) {
  const existing = S.tabs.find(t => isFile(t) && t.projectId === pid && t.relPath === rel);
  if (existing) { placeInSplit(existing); return activate(existing.id); }
  let res;
  try { res = await window.ide.files.read(pid, rel); } catch (e) { return toast(`Couldn't open ${baseName(rel)}: ${e.message}`); }
  if (res.binary) return toast(`${baseName(rel)} isn't a text file, so it can't be edited here.`);
  if (res.tooLarge) return toast(`${baseName(rel)} is larger than 5 MB, too big to edit here.`);

  const host = document.createElement('div');
  host.className = 'term-host file-host';
  host.style.setProperty('--gc', project(pid)?.color || 'var(--accent)');
  host.innerHTML = '<div class="file-banner" hidden></div><div class="cm-wrap"></div><div class="file-note" hidden></div>';
  $('#terminals').appendChild(host);
  host.addEventListener('mousedown', () => { if (S.activeId !== t.id) activate(t.id); });

  const lang = CM.languageFor(baseName(rel));
  const t = {
    id: nextFileId--, kind: 'file', projectId: pid, relPath: rel, host, lang: lang.name,
    savedText: res.text, mtime: res.mtime, dirty: false, line: 1, col: 1, title: baseName(rel),
  };
  const fontSize = CM.EditorView.theme({ '&': { fontSize: (S.settings.fontSize || 13) + 'px' } });
  t.fontCompartment = new CM.Compartment();
  t.view = new CM.EditorView({
    parent: host.querySelector('.cm-wrap'),
    state: CM.EditorState.create({
      doc: res.text,
      extensions: [
        CM.lineNumbers(), CM.highlightActiveLineGutter(), CM.highlightSpecialChars(), CM.history(), CM.foldGutter(),
        CM.drawSelection(), CM.dropCursor(), CM.EditorState.allowMultipleSelections.of(true), CM.indentOnInput(),
        CM.syntaxHighlighting(paperHighlight), CM.bracketMatching(), CM.closeBrackets(), CM.rectangularSelection(),
        CM.crosshairCursor(), CM.highlightActiveLine(), CM.highlightSelectionMatches(),
        CM.keymap.of([
          ...CM.closeBracketsKeymap, ...CM.defaultKeymap, ...CM.searchKeymap, ...CM.historyKeymap, ...CM.foldKeymap, CM.indentWithTab,
        ]),
        lang.support, paperTheme, t.fontCompartment.of(fontSize), changedLines,
        CM.EditorView.updateListener.of(u => {
          if (u.docChanged) {
            const len = u.state.doc.length;
            const dirty = len > 400000 ? true : u.state.doc.toString() !== t.savedText;
            if (dirty !== t.dirty) { t.dirty = dirty; renderTabs(); }
          }
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head, line = u.state.doc.lineAt(head);
            t.line = line.number; t.col = head - line.from + 1;
            if (S.activeId === t.id) scheduleStatus();
          }
        }),
      ],
    }),
  });
  S.tabs.push(t);
  if (!S.groupOrder.includes(pid)) S.groupOrder.push(pid);
  window.ide.files.watch(pid, rel, res.mtime);
  placeInSplit(t);
  activate(t.id);
  if (focus) t.view.focus();
  return t;
}

let statusTimer = null;
function scheduleStatus() { if (!statusTimer) statusTimer = setTimeout(() => { statusTimer = null; renderStatus(); }, 80); }

async function saveFile(t, { force = false } = {}) {
  if (!isFile(t)) return;
  const text = t.view.state.doc.toString();
  let res = await window.ide.files.write(t.projectId, t.relPath, text, t.mtime, force);
  if (res.conflict) {
    const ok = confirm(`${baseName(t.relPath)} changed on disk since you opened it (Claude may have edited it).\n\nOverwrite it with your version?`);
    if (!ok) return;
    res = await window.ide.files.write(t.projectId, t.relPath, text, t.mtime, true);
  }
  if (res.ok) {
    t.savedText = text; t.mtime = res.mtime; t.dirty = false;
    hideBanner(t);
    note(t, 'Saved', 'saved');
    renderTabs(); renderStatus();
  }
}

function confirmCloseFile(t) {
  return !t.dirty || confirm(`${baseName(t.relPath)} has unsaved changes. Close it and discard them?`);
}
function disposeFile(t) {
  window.ide.files.unwatch(t.projectId, t.relPath);
  t.view.destroy();
}

// ------------------------------------------------------------- outside changes (e.g. Claude)
window.ide.files.onChanged(async (pid, rel, mtime) => {
  const t = S.tabs.find(x => isFile(x) && x.projectId === pid && x.relPath === rel);
  if (!t || Math.abs(mtime - t.mtime) < 1) return;
  let res;
  try { res = await window.ide.files.read(pid, rel); } catch { return; }
  if (res.text == null) return;
  const current = t.view.state.doc.toString();
  if (res.text === current) { t.mtime = res.mtime; t.savedText = res.text; if (t.dirty) { t.dirty = false; renderTabs(); } return; }
  if (t.dirty) return showConflictBanner(t, res);
  applyDiskText(t, res);
});

function claudeInProject(pid) { return S.tabs.some(x => x.projectId === pid && x.claude); }

function applyDiskText(t, res) {
  const old = t.view.state.doc.toString();
  const lines = changedLineNumbers(old, res.text);
  const sel = t.view.state.selection.main.head;
  t.view.dispatch({ changes: { from: 0, to: t.view.state.doc.length, insert: res.text },
    selection: { anchor: Math.min(sel, res.text.length) } });
  t.savedText = res.text; t.mtime = res.mtime; t.dirty = false;
  const doc = t.view.state.doc, b = new CM.RangeSetBuilder();
  for (const n of lines) if (n <= doc.lines) b.add(doc.line(n).from, doc.line(n).from, changedLineDeco);
  t.view.dispatch({ effects: setChanged.of(b.finish()) });
  if (lines[0] <= doc.lines) t.view.dispatch({ effects: CM.EditorView.scrollIntoView(doc.line(lines[0]).from, { y: 'center' }) });
  clearTimeout(t.glowTimer);
  t.glowTimer = setTimeout(() => t.view.dispatch({ effects: setChanged.of(CM.Decoration.none) }), 6000);
  const n = lines.length;
  note(t, `${n} line${n === 1 ? '' : 's'} changed ${claudeInProject(t.projectId) ? 'by Claude' : 'on disk'} · just now`, 'changed');
  renderTabs(); renderStatus();
}

function showConflictBanner(t, res) {
  const el = t.host.querySelector('.file-banner');
  el.innerHTML = `<span>${claudeInProject(t.projectId) ? 'Claude changed this file' : 'This file changed on disk'} while you have unsaved edits.</span>` +
    `<button data-act="theirs" class="btn sm">Load new version</button><button data-act="mine" class="btn sm tonal">Keep mine</button>`;
  el.hidden = false;
  el.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'theirs') { applyDiskText(t, res); hideBanner(t); }
    if (act === 'mine') { t.mtime = res.mtime; hideBanner(t); t.view.focus(); }
  };
}
function hideBanner(t) { const el = t.host.querySelector('.file-banner'); el.hidden = true; el.onclick = null; }

function note(t, text, kind) {
  const el = t.host.querySelector('.file-note');
  el.textContent = text; el.className = `file-note ${kind}`; el.hidden = false;
  clearTimeout(t.noteTimer);
  t.noteTimer = setTimeout(() => { el.hidden = true; }, kind === 'saved' ? 1500 : 6000);
}

function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 3500);
}

// ------------------------------------------------------------- split view
// One split per project: a file on the left, a terminal (usually Claude) on the right.
S.splits = {};      // pid -> { fileId, termId }
S.splitRatio = {};  // pid -> fraction of width for the file side
S.treeOpen = {};    // pid -> bool

function lastTerminal(pid) {
  const ts = S.tabs.filter(t => t.projectId === pid && !isFile(t));
  const last = tab(S.lastActiveTerm?.[pid]);
  return (last && !isFile(last) && last.projectId === pid) ? last : (ts.find(t => t.claude) || ts[0]);
}

// When a file opens (or is re-opened) while you're on a terminal in the same project, pair them.
function placeInSplit(f) {
  const cur = activeTab(), pid = f.projectId;
  const sp = S.splits[pid];
  if (cur && cur.projectId === pid && !isFile(cur)) S.splits[pid] = { fileId: f.id, termId: cur.id };
  else if (sp && (cur?.id === sp.fileId)) sp.fileId = f.id;
}

function toggleSplit() {
  const t = activeTab();
  if (!t) return;
  const pid = t.projectId, sp = S.splits[pid];
  if (sp && (sp.fileId === t.id || sp.termId === t.id)) { delete S.splits[pid]; return activate(t.id); }
  if (isFile(t)) {
    const term = lastTerminal(pid);
    if (!term) return toast('Open a terminal or Claude tab in this project to split with.');
    S.splits[pid] = { fileId: t.id, termId: term.id };
  } else {
    const f = tab(S.lastActiveFile?.[pid]) || S.tabs.find(x => isFile(x) && x.projectId === pid);
    if (!f) return toast('Open a file first (⌘P), then split.');
    S.splits[pid] = { fileId: f.id, termId: t.id };
  }
  activate(t.id);
}

function dropFromSplits(id) {
  for (const [pid, sp] of Object.entries(S.splits)) if (sp.fileId === id || sp.termId === id) delete S.splits[pid];
}

const GAP = 10, EDGE = 14, TREE_W = 214;
function layoutPanes(active) {
  if (!active) return;
  const pid = active.projectId;
  S.lastActiveTerm = S.lastActiveTerm || {}; S.lastActiveFile = S.lastActiveFile || {};
  if (isFile(active)) S.lastActiveFile[pid] = active.id; else S.lastActiveTerm[pid] = active.id;

  const area = $('#terminals'), W = area.clientWidth;
  const treeOpen = !!S.treeOpen[pid];
  renderTree(pid, treeOpen);
  let left = EDGE + (treeOpen ? TREE_W + GAP : 0);

  const sp = S.splits[pid];
  const paired = sp && tab(sp.fileId) && tab(sp.termId) && (sp.fileId === active.id || sp.termId === active.id);
  const visible = paired ? [tab(sp.fileId), tab(sp.termId)] : [active];
  for (const o of S.tabs) {
    const on = visible.includes(o);
    o.host.classList.toggle('active', on);
    o.host.classList.toggle('focused-pane', o === active && paired);
    if (!on) continue;
  }
  const splitter = $('#splitter');
  if (paired) {
    const avail = W - left - EDGE - GAP;
    const r = Math.min(0.8, Math.max(0.2, S.splitRatio[pid] ?? 0.5));
    const fw = Math.round(avail * r);
    const [f, term] = visible;
    Object.assign(f.host.style, { left: left + 'px', right: 'auto', width: fw + 'px' });
    Object.assign(term.host.style, { left: (left + fw + GAP) + 'px', right: EDGE + 'px', width: 'auto' });
    Object.assign(splitter.style, { left: (left + fw) + 'px', width: GAP + 'px' });
    splitter.hidden = false;
    splitter.dataset.pid = pid;
  } else {
    Object.assign(active.host.style, { left: left + 'px', right: EDGE + 'px', width: 'auto' });
    splitter.hidden = true;
  }
  requestAnimationFrame(() => { for (const o of visible) if (!isFile(o)) { try { o.fit.fit(); } catch {} } });
}

// Drag the handle between the panes to resize; remembered per project for this session.
(function initSplitter() {
  const sp = document.createElement('div');
  sp.id = 'splitter'; sp.hidden = true; sp.innerHTML = '<i></i><i></i><i></i>';
  $('#terminals').appendChild(sp);
  sp.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const pid = sp.dataset.pid, area = $('#terminals'), rect = area.getBoundingClientRect();
    const left = EDGE + (S.treeOpen[pid] ? TREE_W + GAP : 0), avail = rect.width - left - EDGE - GAP;
    document.body.classList.add('resizing');
    const move = (ev) => { S.splitRatio[pid] = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left - left) / avail)); layoutPanes(activeTab()); };
    const up = () => { document.body.classList.remove('resizing'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  });
  sp.addEventListener('dblclick', () => { S.splitRatio[sp.dataset.pid] = 0.5; layoutPanes(activeTab()); });
  new ResizeObserver(() => { if (S.view === 'term') layoutPanes(activeTab()); }).observe($('#terminals'));
})();

// ------------------------------------------------------------- file tree
S.trees = {}; // pid -> { open: Set(rel), cache: Map(rel -> entries) }
let treeRenderedFor = null;

function treeState(pid) { return S.trees[pid] || (S.trees[pid] = { open: new Set(['']), cache: new Map() }); }

async function loadDir(pid, rel) {
  const st = treeState(pid);
  try { st.cache.set(rel, await window.ide.files.list(pid, rel)); } catch { st.cache.set(rel, []); }
}

async function renderTree(pid, show) {
  const el = $('#filetree');
  el.hidden = !show;
  if (!show) return;
  const st = treeState(pid);
  if (!st.cache.has('')) await loadDir(pid, '');
  const activeRel = isFile(activeTab()) && activeTab().projectId === pid ? activeTab().relPath : null;
  const rows = [];
  const walk = (rel, depth) => {
    for (const e of st.cache.get(rel) || []) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      const isOpen = e.dir && st.open.has(child);
      const dirty = !e.dir && S.tabs.some(t => isFile(t) && t.projectId === pid && t.relPath === child && t.dirty);
      rows.push(`<div class="tree-row ${e.dir ? 'dir' : 'file'} ${child === activeRel ? 'current' : ''}" style="--d:${depth}" data-rel="${esc(child)}" data-dir="${e.dir ? 1 : ''}" title="${esc(child)}">` +
        `<span class="caret">${e.dir ? (isOpen ? '▾' : '▸') : fileIcon(child)}</span><span class="nm">${esc(e.name)}</span>${dirty ? '<span class="dirty">●</span>' : ''}</div>`);
      if (isOpen) walk(child, depth + 1);
    }
  };
  walk('', 0);
  const p = project(pid);
  el.innerHTML = `<div class="tree-head" style="--gc:${p?.color}"><span>${esc(p?.name || '')}</span>` +
    `<button data-tree="refresh" title="Refresh">↻</button><button data-tree="close" title="Hide files (⌘B)">×</button></div>` +
    `<div class="tree-body">${rows.join('') || '<div class="tree-empty">No files</div>'}</div>`;
  el.dataset.pid = pid;
  treeRenderedFor = pid;
}

$('#filetree').addEventListener('click', async (e) => {
  const pid = $('#filetree').dataset.pid;
  const btn = e.target.closest('[data-tree]');
  if (btn) {
    if (btn.dataset.tree === 'close') { S.treeOpen[pid] = false; layoutPanes(activeTab()); }
    if (btn.dataset.tree === 'refresh') { const st = treeState(pid); st.cache.clear(); for (const r of st.open) await loadDir(pid, r); renderTree(pid, true); }
    return;
  }
  const row = e.target.closest('.tree-row');
  if (!row) return;
  const rel = row.dataset.rel, st = treeState(pid);
  if (row.dataset.dir) {
    if (st.open.has(rel)) st.open.delete(rel);
    else { st.open.add(rel); if (!st.cache.has(rel)) await loadDir(pid, rel); }
    renderTree(pid, true);
  } else {
    openFile(pid, rel);
  }
});

function toggleTree(pid) {
  pid = pid || activeTab()?.projectId;
  if (!pid) return;
  S.treeOpen[pid] = !S.treeOpen[pid];
  if (S.view !== 'term' || activeTab()?.projectId !== pid) { openProject(pid); return; }
  layoutPanes(activeTab());
}

// ------------------------------------------------------------- quick open (⌘P)
const qo = { files: [], pid: null, sel: 0, list: [] };
function fuzzyScore(q, s) {
  let qi = 0, score = 0, last = -1;
  const ls = s.toLowerCase();
  for (let i = 0; i < ls.length && qi < q.length; i++) {
    if (ls[i] === q[qi]) { score += (i === last + 1 ? 3 : 1) + (i === 0 || '/._-'.includes(ls[i - 1]) ? 2 : 0); last = i; qi++; }
  }
  if (qi < q.length) return -1;
  const base = ls.slice(ls.lastIndexOf('/') + 1);
  return score + (base.includes(q) ? 10 : 0) - s.length * 0.01;
}
function renderQuickOpen() {
  const q = $('#qo-input').value.trim().toLowerCase();
  qo.list = (q ? qo.files.map(f => [f, fuzzyScore(q, f)]).filter(x => x[1] >= 0).sort((a, b) => b[1] - a[1]).map(x => x[0]) : qo.files).slice(0, 60);
  qo.sel = Math.min(qo.sel, Math.max(0, qo.list.length - 1));
  $('#qo-list').innerHTML = qo.list.map((f, i) => {
    const slash = f.lastIndexOf('/');
    return `<div class="qo-row ${i === qo.sel ? 'sel' : ''}" data-i="${i}">${fileIcon(f)}<span class="nm">${esc(f.slice(slash + 1))}</span><span class="dir">${esc(slash > 0 ? f.slice(0, slash) : '')}</span></div>`;
  }).join('') || '<div class="qo-empty">No matching files</div>';
  $('#qo-list').querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
}
async function quickOpen() {
  const pid = activeTab()?.projectId || S.projects[0]?.id;
  if (!pid) return;
  qo.pid = pid; qo.sel = 0;
  $('#qo-input').value = '';
  $('#qo-title').textContent = project(pid)?.name || '';
  $('#qo-list').innerHTML = '<div class="qo-empty">Listing files…</div>';
  $('#quickopen').showModal();
  try { qo.files = await window.ide.files.all(pid); } catch { qo.files = []; }
  renderQuickOpen();
}
$('#qo-input').addEventListener('input', () => { qo.sel = 0; renderQuickOpen(); });
$('#qo-input').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { qo.sel = Math.min(qo.sel + 1, qo.list.length - 1); renderQuickOpen(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { qo.sel = Math.max(qo.sel - 1, 0); renderQuickOpen(); e.preventDefault(); }
  if (e.key === 'Enter' && qo.list[qo.sel]) { $('#quickopen').close(); openFile(qo.pid, qo.list[qo.sel]); }
});
$('#qo-list').addEventListener('click', (e) => {
  const row = e.target.closest('[data-i]');
  if (row) { $('#quickopen').close(); openFile(qo.pid, qo.list[+row.dataset.i]); }
});

// Font size changes from Settings apply to editors too.
function applyEditorFont() {
  for (const t of S.tabs) if (isFile(t)) t.view.dispatch({ effects: t.fontCompartment.reconfigure(CM.EditorView.theme({ '&': { fontSize: (S.settings.fontSize || 13) + 'px' } })) });
}

// Unsaved edits block quitting until confirmed (main shows the dialog).
window.addEventListener('beforeunload', (e) => { if (S.tabs.some(t => isFile(t) && t.dirty)) { e.preventDefault(); e.returnValue = false; } });
