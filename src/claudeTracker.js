// Tracks Claude Code sessions running inside terminal tabs and reports how
// close each conversation is to auto-compaction.
//
// Claude Code writes one JSONL transcript per session to
//   ~/.claude/projects/<cwd with every non-alphanumeric char replaced by "-">/<session-id>.jsonl
// Each assistant entry carries `message.usage`; the context size of the
// conversation is input + cache_creation + cache_read (+ output, which becomes
// part of the next turn's input). Compactions are logged as
//   {"type":"system","subtype":"compact_boundary","compactMetadata":{"trigger":"auto","preTokens":N}}
// which we use both to reset the meter and to learn where compaction fires.

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const FALLBACK_THRESHOLD = 167_000; // 200k window − 20k output reserve − 13k buffer
const LARGE_WINDOW_THRESHOLD = 950_000; // 1M-context sessions

function encodeCwd(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

function transcriptDir(cwd) {
  const enc = encodeCwd(cwd);
  const exact = path.join(PROJECTS_DIR, enc);
  if (enc.length <= 200 || fs.existsSync(exact)) return exact;
  // Very long paths get truncated + suffixed by Claude Code; match on the prefix.
  try {
    const hit = fs.readdirSync(PROJECTS_DIR).find(d => d.length < enc.length && d.startsWith(enc.slice(0, 200)));
    if (hit) return path.join(PROJECTS_DIR, hit);
  } catch {}
  return exact;
}

function listTranscripts(cwd) {
  const dir = transcriptDir(cwd);
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (!n.endsWith('.jsonl')) continue;
    const file = path.join(dir, n);
    try {
      const st = fs.statSync(file);
      out.push({ file, sessionId: n.slice(0, -6), mtimeMs: st.mtimeMs, birthtimeMs: st.birthtimeMs, size: st.size });
    } catch {}
  }
  return out;
}

// Incremental parser: only reads bytes appended since the last poll.
class TranscriptState {
  constructor(file) {
    this.file = file;
    this.offset = 0;
    this.partial = '';
    this.used = 0;
    this.model = null;
    this.requestedModel = null;
    this.effort = null;
    this.compactions = []; // auto preTokens values
    this.lastCompactAt = null;
    this.turns = 0;
    this.lastActivity = null;
  }

  update() {
    let st;
    try { st = fs.statSync(this.file); } catch { return this; }
    if (st.size < this.offset) { // truncated/rewritten
      Object.assign(this, new TranscriptState(this.file));
    }
    if (st.size === this.offset) return this;
    const fd = fs.openSync(this.file, 'r');
    try {
      const len = st.size - this.offset;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, this.offset);
      this.offset = st.size;
      const text = this.partial + buf.toString('utf8');
      const lines = text.split('\n');
      this.partial = lines.pop() || '';
      for (const line of lines) this._consume(line);
    } finally {
      fs.closeSync(fd);
    }
    return this;
  }

  _consume(line) {
    if (!line) return;
    // Cheap prefilter: skip lines that can't matter.
    if (!line.includes('"usage"') && !line.includes('compact_boundary')) return;
    let e;
    try { e = JSON.parse(line); } catch { return; }
    if (e.type === 'system' && e.subtype === 'compact_boundary') {
      this.used = e.compactMetadata?.postTokens || 0;
      this.lastCompactAt = e.timestamp || null;
      const meta = e.compactMetadata || {};
      if (meta.trigger === 'auto' && meta.preTokens) this.compactions.push(meta.preTokens);
      return;
    }
    if (e.type !== 'assistant' || e.isSidechain) return;
    const m = e.message;
    const u = m?.usage;
    if (!u || m.model === '<synthetic>') return;
    const used = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) +
      (u.cache_read_input_tokens || 0) + (u.output_tokens || 0);
    if (!used) return;
    this.used = used;
    this.model = m.model || this.model;
    this.requestedModel = e.requestedModel || this.requestedModel;
    this.effort = e.effort || this.effort;
    this.lastActivity = e.timestamp || this.lastActivity;
    this.turns++;
  }
}

class ClaudeTracker {
  constructor(getSettings) {
    this.getSettings = getSettings;
    this.states = new Map(); // file -> TranscriptState
    this.claims = new Map(); // tabId -> file
    this.calibrated = null;  // learned auto-compaction threshold for normal windows
    this.calibratedLarge = null;
    this.calibrate();
  }

  // Learn where auto-compaction fires from the user's own history.
  async calibrate() {
    const small = [], large = [];
    let dirs = [];
    try { dirs = await fs.promises.readdir(PROJECTS_DIR); } catch { return; }
    const re = /"trigger":"auto","preTokens":(\d+)/g;
    for (const d of dirs) {
      let files = [];
      try { files = await fs.promises.readdir(path.join(PROJECTS_DIR, d)); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        let text;
        try { text = await fs.promises.readFile(path.join(PROJECTS_DIR, d, f), 'utf8'); } catch { continue; }
        if (!text.includes('compact_boundary')) continue;
        for (const m of text.matchAll(re)) {
          const n = +m[1];
          (n > 500_000 ? large : small).push(n);
        }
      }
    }
    const median = (a) => a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : null;
    this.calibrated = median(small);
    this.calibratedLarge = median(large);
  }

  state(file) {
    let s = this.states.get(file);
    if (!s) { s = new TranscriptState(file); this.states.set(file, s); }
    return s.update();
  }

  thresholdFor(s) {
    const settings = this.getSettings();
    const large = (s.requestedModel || '').includes('[1m]');
    if (large) return settings.largeCompactThreshold || this.calibratedLarge || LARGE_WINDOW_THRESHOLD;
    let t = settings.compactThreshold || null;
    // Best signal: this very session already auto-compacted once.
    if (!t && s.compactions.length) t = s.compactions[s.compactions.length - 1];
    if (!t) t = this.calibrated || FALLBACK_THRESHOLD;
    // Usage beyond the threshold without compacting means a bigger window.
    if (s.used > t * 1.08) t = settings.largeCompactThreshold || this.calibratedLarge || LARGE_WINDOW_THRESHOLD;
    return t;
  }

  release(tabId) { this.claims.delete(tabId); }

  // tab: { id, cwd, claudeSince (ms timestamp when claude became foreground) }
  statusFor(tab) {
    const all = listTranscripts(tab.cwd);
    const claimedByOthers = new Set([...this.claims].filter(([id]) => id !== tab.id).map(([, f]) => f));
    const free = all.filter(t => !claimedByOthers.has(t.file));
    let file = this.claims.get(tab.id);
    const current = file && all.find(t => t.file === file);

    if (!current) {
      // Pick the newest free transcript touched since claude started in this tab.
      const cands = free.filter(t => t.mtimeMs >= tab.claudeSince - 3000).sort((a, b) => b.mtimeMs - a.mtimeMs);
      file = cands[0]?.file || null;
    } else {
      // Handle /clear, /resume etc.: a free transcript that is clearly more active wins.
      const newer = free.filter(t => t.file !== current.file && t.mtimeMs > current.mtimeMs + 2000 && t.mtimeMs >= tab.claudeSince)
        .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
      if (newer) file = newer.file;
    }
    if (!file) { this.claims.delete(tab.id); return { active: true, pending: true }; }
    this.claims.set(tab.id, file);

    const s = this.state(file);
    const threshold = this.thresholdFor(s);
    return {
      active: true,
      pending: false,
      sessionId: path.basename(file, '.jsonl'),
      used: s.used,
      threshold,
      pct: Math.min(1, s.used / threshold),
      model: s.model,
      requestedModel: s.requestedModel,
      effort: s.effort,
      compactions: s.compactions.length,
      turns: s.turns,
      lastCompactAt: s.lastCompactAt,
    };
  }
}

// Discover project folders from Claude Code's history (reads `cwd` from transcripts).
async function discoverProjects() {
  let dirs = [];
  try { dirs = await fs.promises.readdir(PROJECTS_DIR); } catch { return []; }
  const out = [];
  for (const d of dirs) {
    const full = path.join(PROJECTS_DIR, d);
    let files = [];
    try { files = (await fs.promises.readdir(full)).filter(f => f.endsWith('.jsonl')); } catch { continue; }
    if (!files.length) continue;
    let newest = null;
    for (const f of files) {
      try {
        const st = await fs.promises.stat(path.join(full, f));
        if (!newest || st.mtimeMs > newest.mtimeMs) newest = { f, mtimeMs: st.mtimeMs };
      } catch {}
    }
    if (!newest) continue;
    let cwd = null;
    try {
      const fd = await fs.promises.open(path.join(full, newest.f), 'r');
      const buf = Buffer.alloc(64 * 1024);
      const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
      await fd.close();
      const m = buf.toString('utf8', 0, bytesRead).match(/"cwd":"((?:[^"\\]|\\.)*)"/);
      if (m) cwd = JSON.parse(`"${m[1]}"`);
    } catch {}
    if (!cwd || !fs.existsSync(cwd) || cwd.includes('/scratch-workspaces/')) continue;
    out.push({ path: cwd, sessions: files.length, lastUsed: newest.mtimeMs });
  }
  return out.sort((a, b) => b.lastUsed - a.lastUsed);
}

module.exports = { ClaudeTracker, discoverProjects, listTranscripts };
