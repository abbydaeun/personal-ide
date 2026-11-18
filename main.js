const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const pty = require('node-pty');
const { ClaudeTracker, discoverProjects, listTranscripts } = require('./src/claudeTracker');

// ---------- persistent state ----------
if (process.env.IDE_SMOKE_DIR) app.setPath('userData', path.join(process.env.IDE_SMOKE_DIR, 'userdata'));
const STATE_FILE = path.join(app.getPath('userData'), 'state.json');
const PALETTE = ['#7cc576', '#9aa5d6', '#f2678a', '#f5b731', '#e0604f', '#c9925e', '#df8fc6', '#5bb4e5'];

let state = { projects: [], settings: { compactThreshold: null, largeCompactThreshold: null, fontSize: 13 } };
try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; } catch {}
// Migrate colors from older palettes onto the blue/white theme.
state.projects.forEach((p, i) => { if (!PALETTE.includes(p.color)) p.color = PALETTE[i % PALETTE.length]; });
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

const tracker = new ClaudeTracker(() => state.settings);

function gitBranch(dir) {
  try {
    const head = fs.readFileSync(path.join(dir, '.git', 'HEAD'), 'utf8').trim();
    return head.startsWith('ref: refs/heads/') ? head.slice(16) : head.slice(0, 7);
  } catch { return null; }
}

function addProject(dir) {
  dir = path.resolve(dir);
  let p = state.projects.find(x => x.path === dir);
  if (!p) {
    p = {
      id: Math.random().toString(36).slice(2, 10),
      path: dir,
      name: path.basename(dir),
      color: PALETTE[state.projects.length % PALETTE.length],
      lastOpened: null,
    };
    state.projects.push(p);
    save();
  }
  return p;
}

function decorate(p) {
  const transcripts = listTranscripts(p.path);
  return {
    ...p,
    exists: fs.existsSync(p.path),
    branch: gitBranch(p.path),
    claudeSessions: transcripts.length,
    lastClaude: transcripts.reduce((m, t) => Math.max(m, t.mtimeMs), 0) || null,
    openTabs: [...tabs.values()].filter(t => t.projectId === p.id).length,
  };
}

// ---------- terminals ----------
const tabs = new Map(); // id -> { id, projectId, cwd, pty, tty, claudeSince, created }
let win;
let nextId = 1;

function send(ch, ...args) { if (win && !win.isDestroyed()) win.webContents.send(ch, ...args); }

// Terminals start from a clean environment, like Terminal.app: only the basics
// macOS provides, then the login shell (-l) loads the user's own profile.
// Never pass through whatever launched the IDE: when started from npm, an
// editor, or a Claude Code session, process.env carries npm_*, ELECTRON_*,
// and host-session vars (CLAUDECODE, CLAUDE_CODE_*, ANTHROPIC_BASE_URL…) that
// make `claude` inside the terminal act as a child of that session and fail
// to reach the API once it is gone.
const ENV_KEEP = ['HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'SSH_AUTH_SOCK', '__CF_USER_TEXT_ENCODING'];
function cleanEnv() {
  const env = { PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin' };
  for (const k of ENV_KEEP) if (process.env[k]) env[k] = process.env[k];
  for (const k of Object.keys(process.env)) if (k.startsWith('LC_')) env[k] = process.env[k];
  env.HOME = env.HOME || os.homedir();
  env.SHELL = env.SHELL || '/bin/zsh';
  env.LANG = env.LANG || 'en_US.UTF-8';
  return Object.assign(env, { TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'ClaudeIDE' });
}

ipcMain.handle('pty:create', (_e, { projectId, cols, rows, command }) => {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) throw new Error('Unknown project');
  project.lastOpened = Date.now();
  save();
  const env = cleanEnv();
  const term = pty.spawn(env.SHELL, ['-l'], {
    name: 'xterm-256color',
    cols: cols || 100,
    rows: rows || 30,
    cwd: fs.existsSync(project.path) ? project.path : os.homedir(),
    env,
  });
  const id = nextId++;
  const tab = { id, projectId, cwd: project.path, pty: term, tty: path.basename(term.ptsName || term._pty || ''), claudeSince: null, created: Date.now() };
  tabs.set(id, tab);
  // Batch output to keep IPC cheap during floods (e.g. `cat bigfile`).
  let buf = '', scheduled = false;
  term.onData(d => {
    buf += d;
    if (!scheduled) { scheduled = true; setImmediate(() => { send('pty:data', id, buf); buf = ''; scheduled = false; }); }
  });
  term.onExit(({ exitCode }) => { tabs.delete(id); tracker.release(id); send('pty:exit', id, exitCode); });
  if (command) setTimeout(() => term.write(command + '\r'), 350);
  return { id };
});

ipcMain.on('pty:write', (_e, id, data) => tabs.get(id)?.pty.write(data));
ipcMain.on('pty:resize', (_e, id, cols, rows) => { try { tabs.get(id)?.pty.resize(Math.max(cols, 2), Math.max(rows, 1)); } catch {} });
ipcMain.on('pty:kill', (_e, id) => { const t = tabs.get(id); if (t) { try { t.pty.kill(); } catch {} } });

// ---------- status polling (foreground process + Claude context) ----------
// Only asks about our own terminals (-t per tty) rather than every process on the Mac.
function foregroundProcs(ttys) {
  return new Promise(resolve => {
    if (!ttys.length) return resolve(new Map());
    const args = ['-ww', '-o', 'pid=,tpgid=,tty=,comm=', ...ttys.flatMap(t => ['-t', t])];
    execFile('ps', args, { maxBuffer: 1 << 20 }, (err, out) => {
      const map = new Map(); // tty -> { pid, comm } of foreground process group leader
      if (!err) for (const line of out.split('\n')) {
        const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
        if (m && m[1] === m[2]) map.set(m[3], { pid: +m[1], comm: path.basename(m[4]) });
      }
      resolve(map);
    });
  });
}

// Current working directory of each pid (follows `cd`), via one lsof call.
function cwdsOf(pids) {
  return new Promise(resolve => {
    const map = new Map();
    if (!pids.length) return resolve(map);
    execFile('lsof', ['-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')], (_err, out) => {
      let pid = null;
      for (const line of (out || '').split('\n')) {
        if (line[0] === 'p') pid = +line.slice(1);
        else if (line[0] === 'n' && pid) map.set(pid, line.slice(1));
      }
      resolve(map);
    });
  });
}

const windowActive = () => !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused();

// Working directories change rarely (only on `cd`), so lsof runs at most every few
// seconds, or right away when a new foreground process appears.
let cwdCache = new Map(), cwdCheckedAt = 0;
async function currentCwds(pids) {
  const fresh = Date.now() - cwdCheckedAt < (windowActive() ? 3000 : 15000);
  if (fresh && pids.every(p => cwdCache.has(p))) return cwdCache;
  cwdCache = await cwdsOf(pids);
  cwdCheckedAt = Date.now();
  return cwdCache;
}

async function poll() {
  if (!tabs.size) return;
  const fg = await foregroundProcs([...new Set([...tabs.values()].map(t => t.tty).filter(Boolean))]);
  const pids = [];
  for (const tab of tabs.values()) {
    pids.push(tab.pty.pid);
    const f = fg.get(tab.tty);
    if (f && f.pid !== tab.pty.pid) pids.push(f.pid);
  }
  const cwds = await currentCwds(pids);
  const statuses = [];
  for (const tab of tabs.values()) {
    const f = fg.get(tab.tty);
    const proc = f?.comm || path.basename(process.env.SHELL || 'zsh');
    const shellCwd = cwds.get(tab.pty.pid) || tab.cwd;
    const isClaude = /claude/i.test(proc);
    if (isClaude && !tab.claudeSince) tab.claudeSince = Date.now();
    if (!isClaude && tab.claudeSince) { tab.claudeSince = null; tracker.release(tab.id); }
    let claude = null;
    if (isClaude) {
      // Claude names its transcript folder after the directory it was started in.
      const claudeCwd = cwds.get(f.pid) || shellCwd;
      try { claude = tracker.statusFor({ ...tab, cwd: claudeCwd }); } catch (e) { claude = { active: true, pending: true }; }
    }
    statuses.push({ id: tab.id, process: proc.replace(/^-/, ''), cwd: (isClaude && cwds.get(f.pid)) || shellCwd, claude });
  }
  send('tabs:status', statuses);
}
// Check every 1.5s while you're looking at the window, every 5s otherwise.
(async function pollLoop() {
  try { await poll(); } catch {}
  setTimeout(pollLoop, windowActive() ? 1500 : 5000);
})();

// ---------- projects / settings IPC ----------
ipcMain.handle('projects:list', () => state.projects.map(decorate));
ipcMain.handle('projects:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return decorate(addProject(r.filePaths[0]));
});
ipcMain.handle('projects:add', (_e, dir) => decorate(addProject(dir)));
ipcMain.handle('projects:remove', (_e, id) => { state.projects = state.projects.filter(p => p.id !== id); save(); });
ipcMain.handle('projects:update', (_e, id, patch) => {
  const p = state.projects.find(x => x.id === id);
  if (p) { Object.assign(p, patch); save(); }
  return p && decorate(p);
});
ipcMain.handle('projects:discover', async () => {
  const known = new Set(state.projects.map(p => p.path));
  return (await discoverProjects()).filter(d => !known.has(d.path)).slice(0, 12);
});
ipcMain.handle('projects:reveal', (_e, dir) => shell.openPath(dir));
// ---------- files (editor) ----------
// Every path is relative to a project and must resolve inside it.
const HIDDEN = new Set(['.git', 'node_modules', '.DS_Store', '__pycache__', '.venv', 'venv', '.mypy_cache', '.pytest_cache', '.next', '.cache', '.idea', '.ruff_cache']);
const MAX_EDIT_BYTES = 5 * 1024 * 1024;

function resolveInProject(projectId, rel = '') {
  const p = state.projects.find(x => x.id === projectId);
  if (!p) throw new Error('Unknown project');
  const root = path.resolve(p.path);
  const abs = path.resolve(root, rel || '.');
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('Path is outside the project');
  return { root, abs };
}

// ipcMain.handle logs every thrown error; file ops report failures as { error } instead.
const quiet = (fn) => async (...args) => { try { return await fn(...args); } catch (e) { return { error: e.message }; } };

ipcMain.handle('fs:list', quiet(async (_e, projectId, rel) => {
  const { abs } = resolveInProject(projectId, rel);
  const ents = await fs.promises.readdir(abs, { withFileTypes: true });
  return ents.filter(d => !HIDDEN.has(d.name))
    .map(d => ({ name: d.name, dir: d.isDirectory() }))
    .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}));

// Flat list of files for quick open (bounded).
ipcMain.handle('fs:all', quiet(async (_e, projectId) => {
  const { root } = resolveInProject(projectId);
  const out = [];
  async function walk(dir, depth) {
    if (out.length >= 8000 || depth > 12) return;
    let ents; try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const d of ents) {
      if (HIDDEN.has(d.name) || out.length >= 8000) continue;
      const full = path.join(dir, d.name);
      if (d.isDirectory()) await walk(full, depth + 1);
      else if (d.isFile()) out.push(path.relative(root, full));
    }
  }
  await walk(root, 0);
  return out;
}));

ipcMain.handle('fs:read', quiet(async (_e, projectId, rel) => {
  const { abs } = resolveInProject(projectId, rel);
  const st = await fs.promises.stat(abs);
  if (st.size > MAX_EDIT_BYTES) return { tooLarge: true, size: st.size };
  const buf = await fs.promises.readFile(abs);
  if (buf.subarray(0, 8000).includes(0)) return { binary: true, size: st.size };
  return { text: buf.toString('utf8'), mtime: st.mtimeMs };
}));

// Refuses to overwrite a file that changed on disk since it was loaded, unless forced.
ipcMain.handle('fs:write', quiet(async (_e, projectId, rel, text, expectedMtime, force) => {
  const { abs } = resolveInProject(projectId, rel);
  try {
    const st = await fs.promises.stat(abs);
    if (!force && expectedMtime && Math.abs(st.mtimeMs - expectedMtime) > 1) return { conflict: true, mtime: st.mtimeMs };
  } catch {}
  await fs.promises.writeFile(abs, text, 'utf8');
  const st = await fs.promises.stat(abs);
  watched.set(`${projectId}\0${rel}`, { projectId, rel, abs, mtime: st.mtimeMs });
  return { ok: true, mtime: st.mtimeMs };
}));

// Open files are checked for outside changes (e.g. Claude editing them). Polling mtimes is
// cheap and, unlike fs.watch, survives editors that save by replacing the file.
const watched = new Map();
ipcMain.on('fs:watch', (_e, projectId, rel, mtime) => {
  try { const { abs } = resolveInProject(projectId, rel); watched.set(`${projectId}\0${rel}`, { projectId, rel, abs, mtime }); } catch {}
});
ipcMain.on('fs:unwatch', (_e, projectId, rel) => watched.delete(`${projectId}\0${rel}`));
setInterval(async () => {
  for (const w of watched.values()) {
    try {
      const st = await fs.promises.stat(w.abs);
      if (st.mtimeMs !== w.mtime) { w.mtime = st.mtimeMs; send('fs:changed', w.projectId, w.rel, st.mtimeMs); }
    } catch { /* deleted or moved: leave as is */ }
  }
}, 1000);

// Agent status: bring the window forward from a notification; Dock badge = Claudes waiting on you.
ipcMain.on('win:focus', () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } });
ipcMain.on('dock:badge', (_e, n) => app.dock?.setBadge(n ? String(n) : ''));
ipcMain.on('dock:bounce', () => { if (win && !win.isDestroyed() && !win.isFocused()) app.dock?.bounce('informational'); });
ipcMain.handle('settings:get', () => ({ ...state.settings, calibrated: tracker.calibrated, calibratedLarge: tracker.calibratedLarge }));
ipcMain.handle('settings:set', (_e, patch) => { Object.assign(state.settings, patch); save(); return state.settings; });

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 420,
    backgroundColor: '#fdfaf3',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 13 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: !process.env.IDE_SMOKE_DIR },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Quit anyway', 'Cancel'], defaultId: 1, cancelId: 1,
      message: 'You have unsaved file changes', detail: 'Quitting now will discard them.' });
    if (choice === 0) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  if (process.env.IDE_SMOKE_DIR) require('./scripts/smoke')(win, process.env.IDE_SMOKE_DIR);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  for (const t of tabs.values()) { try { t.pty.kill(); } catch {} }
  app.quit();
});
