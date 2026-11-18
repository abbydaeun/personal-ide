// Scripted smoke test: IDE_SMOKE_DIR=/some/dir IDE_SMOKE_PROJECTS=a:b npm start
// Drives the renderer and writes screenshots + a log into IDE_SMOKE_DIR, then quits.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

module.exports = function smoke(win, dir) {
  const wc = win.webContents;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { win.show(); win.focus(); wc.invalidate(); await wait(400); fs.writeFileSync(path.join(dir, name + '.png'), (await wc.capturePage()).toPNG()); };
  const log = (...a) => fs.appendFileSync(path.join(dir, 'log.txt'), a.join(' ') + '\n');
  wc.on('console-message', (_e, level, msg) => log('console', level, msg));


  // IDE_DEMO=1: stage a clean, made-up scene for README screenshots (no personal paths or prompts).
  // Projects live under IDE_DEMO_ROOT; the Claude tab shows an example transcript drawn straight into xterm.
  async function demo() {
    const root = process.env.IDE_DEMO_ROOT;
    const W = path.join(root, 'weather-app'), N = path.join(root, 'notes-site');
    const files = {
      'src/app.py': 'from flask import Flask, jsonify\nfrom .weather import fetch_current, fetch_daily\nfrom .cache import cache\n\napp = Flask(__name__)\n\n\n@app.get("/weather/<city>")\ndef weather(city):\n    """Current conditions for a city."""\n    return jsonify(fetch_current(city))\n\n\n@app.get("/health")\ndef health():\n    return {"ok": True}\n',
      'src/weather.py': 'import requests\n\nAPI = "https://api.example.com/v1"\n\n\ndef fetch_current(city):\n    return requests.get(f"{API}/current", params={"q": city}).json()\n\n\ndef fetch_daily(city, days=5):\n    return requests.get(f"{API}/daily", params={"q": city, "days": days}).json()\n',
      'src/cache.py': 'import time\nfrom functools import wraps\n',
      'tests/test_app.py': 'def test_health(client):\n    assert client.get("/health").json == {"ok": True}\n',
      'README.md': '# Weather App\n\nA tiny Flask API for current weather and forecasts.\n',
      'config.yaml': 'cache_ttl: 600\ndefault_city: Seattle\n',
      'requirements.txt': 'flask\nrequests\n', 'data/cities.csv': 'city,lat,lon\nSeattle,47.6,-122.3\n',
      '.env': 'WEATHER_API_KEY=example\n', 'pyproject.toml': '[project]\nname = "weather-app"\n',
    };
    for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(W, rel)), { recursive: true }); fs.writeFileSync(path.join(W, rel), text); }
    fs.mkdirSync(N, { recursive: true }); fs.writeFileSync(path.join(N, 'index.html'), '<h1>Notes</h1>\n');

    for (const p of [W, N]) await js(`window.ide.projects.add(${JSON.stringify(p)})`);
    await js('refreshProjects()'); await wait(1500);
    const [pidW, pidN] = await js('S.projects.map(p => p.id)');
    await shot('demo-home');

    // Tabs: weather-app gets a shell + a Claude tab, notes-site gets a shell.
    await js(`openTerminal(${JSON.stringify(pidW)}).then(() => null)`); await wait(900);
    await js(`openTerminal(${JSON.stringify(pidN)}).then(() => null)`); await wait(900);
    await js(`activate(S.tabs[0].id); null`); await wait(300);
    await js(`window.ide.pty.write(S.activeId, ${JSON.stringify(process.env.IDE_SMOKE_FAKE_CLAUDE + ' 600\r')})`);
    await wait(1500);
    const tdir = path.join(require('os').homedir(), '.claude', 'projects', W.replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(tdir, { recursive: true });
    const usage = { input_tokens: 6, cache_creation_input_tokens: 3100, cache_read_input_tokens: 84000, output_tokens: 1200 };
    fs.writeFileSync(path.join(tdir, 'demo-session.jsonl'), JSON.stringify({ type: 'assistant', isSidechain: false, effort: 'high', message: { model: 'claude-opus-5-5', usage } }) + '\n');
    await wait(3500); // let status polling detect Claude + read the transcript

    // Clean screens: a neutral prompt in shell tabs, an example Claude session in the Claude tab.
    const ESC = '\x1b';
    const dim = (t) => `${ESC}[90m${t}${ESC}[39m`, orange = (t) => `${ESC}[38;2;217;119;87m${t}${ESC}[39m`, bold = (t) => `${ESC}[1m${t}${ESC}[22m`;
    const claudeScreen = [
      '',
      `${ESC}[100m > add a /forecast/<city> endpoint for the next 5 days and cache it for 10 min ${ESC}[49m`,
      '',
      `${orange('⏺')} I'll add a cached forecast route next to the existing weather endpoint.`,
      '',
      `${orange('⏺')} ${bold('Update')}(src/app.py)`,
      `  ${dim('⎿')}  Updated src/app.py with 6 additions`,
      `      ${ESC}[42m 14 +@app.get("/forecast/<city>")        ${ESC}[49m`,
      `      ${ESC}[42m 15 +@cache(ttl=600)                     ${ESC}[49m`,
      `      ${ESC}[42m 16 +def forecast(city):                 ${ESC}[49m`,
      `      ${ESC}[42m 18 +    return jsonify(fetch_daily(city, days=5))${ESC}[49m`,
      '',
      `${orange('⏺')} ${bold('Bash')}(pytest -q)`,
      `  ${dim('⎿')}  ${ESC}[32m14 passed${ESC}[39m in 0.91s`,
      '',
      `${orange('✻')} Writing summary… ${dim('(4s · esc to interrupt)')}`,
      '',
    ].join('\r\n');
    await js(`(() => {
      const prompt = (t, name) => { t.term.reset(); t.term.write('\\x1b[1m' + name + ' %\\x1b[22m '); };
      const [cl, notes] = S.tabs;
      prompt(notes, 'notes-site');
      cl.term.reset(); cl.bgFilter = createBackgroundFilter(); cl.term.write(cl.bgFilter(${JSON.stringify(claudeScreen)}));
      cl.lastData = Date.now();
    })(); null`);
    await wait(600);
    await js(`evalAgent(S.tabs[0]); renderTabs(); null`);

    // Files: open the tree, expand src, open app.py next to the Claude tab (split).
    await js(`S.collapsed.add(${JSON.stringify(pidN)}); activate(S.tabs[0].id); S.treeOpen[${JSON.stringify(pidW)}] = true; null`);
    await js(`(async () => { const st = treeState(${JSON.stringify(pidW)}); await loadDir(${JSON.stringify(pidW)}, ''); st.open.add('src'); await loadDir(${JSON.stringify(pidW)}, 'src'); })()`);
    await js(`openFile(${JSON.stringify(pidW)}, 'src/app.py', { focus: false }).then(() => null)`); await wait(900);
    await js(`activate(S.tabs[0].id); S.collapsed.add(${JSON.stringify(pidN)}); renderTabs(); null`); await wait(400);

    // "Claude" edits app.py on disk -> live reload with the changed lines glowing.
    const appPy = fs.readFileSync(path.join(W, 'src/app.py'), 'utf8').replace('@app.get("/health")',
      '@app.get("/forecast/<city>")\n@cache(ttl=600)\ndef forecast(city):\n    """Next five days, cached for 10 minutes."""\n    return jsonify(fetch_daily(city, days=5))\n\n\n@app.get("/health")');
    fs.writeFileSync(path.join(W, 'src/app.py'), appPy);
    await wait(1500);
    await js(`(() => { const t = S.tabs.find(x => x.claude); t.agent = null; evalAgent(t); renderTabs(); renderStatus(); })(); null`);
    log('demo claude tab status:', await js(`S.tabs.find(x => x.claude)?.agent`));
    await wait(250);
    await shot('demo-main');

    fs.rmSync(tdir, { recursive: true, force: true });
    log('demo done');
  }

  wc.once('did-finish-load', async () => {
    if (process.env.IDE_DEMO) { try { await demo(); } catch (e) { log('ERROR', e.stack || e); } return app.quit(); }
    try {
      const projects = (process.env.IDE_SMOKE_PROJECTS || '').split(':').filter(Boolean);
      for (const p of projects) await js(`window.ide.projects.add(${JSON.stringify(p)})`);
      await js('refreshProjects()');
      await wait(1500);
      await shot('1-home');
      await js(`document.querySelector('#settings-btn').click(); null`);
      await wait(500);
      await shot('1b-settings');
      await js(`document.querySelector('#settings-dlg').close(); null`);
      await js(`document.querySelector('[data-history]').click(); null`);
      await wait(1500);
      await shot('1c-history');
      await js(`document.querySelector('#history-dlg').close(); null`);

      const ids = await js('S.projects.map(p => p.id)');
      log('projects', JSON.stringify(ids));
      await js(`openTerminal(${JSON.stringify(ids[0])}).then(() => null)`);
      await wait(1200);
      await js(`window.ide.pty.write(S.activeId, 'echo hello from $(pwd)\\r')`);
      // bgsample: the exact background codes Claude Code uses for prompts, command blocks and diffs.
      await js(`window.ide.pty.write(S.activeId, ${JSON.stringify("clear; printf '\\n\\e[100m > can you refactor the login flow and add tests for it?      \\e[49m\\n\\n\\e[40;97m ! npm test \\e[0m\\n\\n\\e[42m+ const ok = true;\\e[49m\\n\\e[41m- const ok = false;\\e[49m\\n\\e[48;2;55;55;55m > rgb-theme prompt \\e[0m\\n'\r")})`);
      await wait(800);
      await shot('0-bg-samples');
      await js(`window.ide.pty.write(S.activeId, 'for i in $(seq 1 200); do echo "line $i of some long output"; done\\r')`);
      await wait(1200);
      await js(`activeTab().term.scrollLines(-60); null`);
      await wait(500);
      log('scrolled-up class', await js(`activeTab().host.classList.contains('scrolled-up')`));
      await shot('0b-scrolled');
      if (process.env.IDE_SMOKE_ENVCHECK) {
        const out = path.join(dir, 'envcheck.txt');
        const cmd = `{ echo leaked=$(env | grep -cE '^(CLAUDE|ANTHROPIC|npm_|ELECTRON)'); echo claude=$(command -v claude); echo api=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' https://api.anthropic.com/v1/models 2>&1); } > '${out}'\r`;
        await js(`window.ide.pty.write(S.activeId, ${JSON.stringify(cmd)})`);
        await wait(4000);
      }
      await js(`openTerminal(${JSON.stringify(ids[0])}).then(() => null)`);
      await wait(1000);
      if (process.env.IDE_SMOKE_FAKE_CLAUDE) {
        // A binary named `claude` plus a synthetic transcript, so no real session is started.
        await js(`window.ide.pty.write(S.activeId, ${JSON.stringify(process.env.IDE_SMOKE_FAKE_CLAUDE + ' 60\r')})`);
        await wait(2000);
        const tdir = path.join(require('os').homedir(), '.claude', 'projects', projects[0].replace(/[^a-zA-Z0-9]/g, '-').slice(0, 200) + '-smoketest');
        fs.mkdirSync(tdir, { recursive: true });
        const usage = { input_tokens: 4, cache_creation_input_tokens: 2100, cache_read_input_tokens: 176000, output_tokens: 900 };
        fs.writeFileSync(path.join(tdir, 'smoke-test.jsonl'),
          JSON.stringify({ type: 'assistant', isSidechain: false, effort: 'high', message: { model: 'claude-opus-5-5', usage } }) + '\n');
        log('transcript', tdir);
      }
      await js(`openTerminal(${JSON.stringify(ids[1])}).then(() => null)`);
      await wait(800);
      await js(`activate(S.tabs[1].id); null`);
      await wait(4500); // let status polling detect claude + transcript
      log('tabs', JSON.stringify(await js('S.tabs.map(t => ({id: t.id, p: t.projectId, proc: t.process, claude: t.claude}))')));
      await shot('2-claude-tab');
      await js(`openMenu('effort', document.querySelector('[data-menu=effort]')); null`);
      await wait(300);
      await shot('2b-effort-menu');
      await js(`document.querySelector('#popmenu [data-val=max]').click(); null`);
      await wait(600);
      log('after-switch', JSON.stringify(await js('S.tabs[1].pendingSwitch')), JSON.stringify(await js(`S.tabs[1].term.buffer.active.getLine(S.tabs[1].term.buffer.active.cursorY)?.translateToString(true)`)));

      await js(`S.collapsed.add(${JSON.stringify(ids[1])}); renderTabs()`);
      await js(`activate(S.tabs[0].id); null`);
      await js(`window.ide.pty.write(S.tabs[0].id, 'mkdir -p src/lib && cd src/lib\\r')`);
      await wait(2800);
      log('cwd0', JSON.stringify(await js('S.tabs[0].cwd')));
      log('term0', JSON.stringify(await js(`S.tabs[0].term.buffer.active.getLine(1)?.translateToString(true) + ' | ' + S.tabs[0].term.buffer.active.getLine(2)?.translateToString(true)`)));
      await shot('3-shell-tab-collapsed-group');
      // IDE_SMOKE_IDLE=N: sit idle on a Claude tab for N seconds (half focused, half in the
      // background) so CPU can be measured from outside. Phases are logged with timestamps.
      // IDE_SMOKE_EDITOR=1: file tree, split, edit/save, outside (Claude) edits, conflicts, quick open.
      if (process.env.IDE_SMOKE_EDITOR) {
        const proj = projects[0], src = path.join(proj, 'src');
        fs.mkdirSync(src, { recursive: true });
        const py = 'import torch\n\ndef train(model, loader):\n    opt = Adam(model.params(), lr=3e-4)\n    for step, batch in enumerate(loader):\n        loss = model(batch).loss\n        loss.backward()\n        opt.step()\n    return "done"  # finished\n';
        fs.writeFileSync(path.join(src, 'train.py'), py);
        fs.writeFileSync(path.join(proj, 'README.md'), '# Alpha API\n\nSome **bold** notes and a [link](https://example.com).\n\n- item one\n- item two\n');
        fs.writeFileSync(path.join(proj, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
        const pidE = ids[0];
        await js(`activate(S.tabs[1].id); toggleTree(${JSON.stringify(pidE)}); null`); await wait(600);
        await js(`(async () => { const st = treeState(${JSON.stringify(pidE)}); st.open.add('src'); await loadDir(${JSON.stringify(pidE)}, 'src'); renderTree(${JSON.stringify(pidE)}, true); })()`);
        await wait(300);
        await js(`openFile(${JSON.stringify(pidE)}, 'src/train.py').then(() => null)`); await wait(800);
        log('editor split ->', await js(`JSON.stringify(S.splits[${JSON.stringify(pidE)}] ? { file: tab(S.splits[${JSON.stringify(pidE)}].fileId).relPath, term: tabLabel(tab(S.splits[${JSON.stringify(pidE)}].termId)) } : null)`));
        log('editor language ->', await js(`activeTab().lang`));
        await shot('e1-split');
        await js(`(async () => { const st = treeState(${JSON.stringify(pidE)}); st.open.add('zoo'); await loadDir(${JSON.stringify(pidE)}, 'zoo'); renderTree(${JSON.stringify(pidE)}, true); })()`);
        await wait(400);
        log('editor icons in tree ->', await js(`document.querySelectorAll('#filetree .tree-row.file img.fi').length + ' doodles / ' + document.querySelectorAll('#filetree .tree-row.file .file-ico').length + ' plain'`));
        await shot('e1b-zoo');
        // type an edit, check dirty, save
        await js(`(() => { const t = activeTab(); t.view.dispatch({ changes: { from: t.view.state.doc.length, insert: '# my note\\n' } }); })(); null`); await wait(200);
        log('editor dirty after typing ->', await js(`activeTab().dirty`));
        await js(`saveFile(activeTab()).then(() => null)`); await wait(400);
        log('editor saved to disk ->', fs.readFileSync(path.join(src, 'train.py'), 'utf8').includes('# my note'), '/ dirty now', await js(`activeTab().dirty`));
        // Claude edits the file on disk -> live reload + highlight
        await wait(1200);
        const edited = fs.readFileSync(path.join(src, 'train.py'), 'utf8').replace('    opt = Adam(model.params(), lr=3e-4)\n', '    opt = Adam(model.params(), lr=3e-4)\n    sched = cosine(opt, warmup=500)\n').replace('        opt.step()\n', '        opt.step()\n        sched.step()\n');
        fs.writeFileSync(path.join(src, 'train.py'), edited);
        await wait(2000);
        log('editor reloaded Claude edit ->', await js(`activeTab().view.state.doc.toString().includes('sched = cosine')`), '/ highlighted lines', await js(`document.querySelectorAll('.cm-claude-changed').length`));
        await shot('e2-claude-edit');
        // conflict: unsaved edit + outside change -> banner instead of overwrite
        await js(`(() => { const t = activeTab(); t.view.dispatch({ changes: { from: 0, insert: '# local edit\\n' } }); })(); null`); await wait(200);
        fs.writeFileSync(path.join(src, 'train.py'), edited + '# claude again\n');
        await wait(2000);
        log('editor conflict banner shown ->', await js(`!activeTab().host.querySelector('.file-banner').hidden`), '/ local edit kept', await js(`activeTab().view.state.doc.toString().startsWith('# local edit')`));
        await shot('e3-conflict');
        await js(`activeTab().host.querySelector('[data-act=theirs]').click(); null`); await wait(300);
        log('editor after "Load new version" ->', await js(`activeTab().view.state.doc.toString().includes('# claude again') && !activeTab().dirty`));
        // markdown raw, binary refused
        await js(`openFile(${JSON.stringify(pidE)}, 'README.md').then(() => null)`); await wait(500);
        log('editor markdown raw ->', await js(`activeTab().lang + ' | starts: ' + JSON.stringify(activeTab().view.state.doc.toString().slice(0, 12))`));
        await shot('e4-markdown');
        await js(`openFile(${JSON.stringify(pidE)}, 'logo.png').then(() => null)`); await wait(300);
        log('editor binary refused ->', await js(`document.getElementById('toast')?.textContent`));
        // quick open
        await js(`quickOpen(); null`); await wait(600);
        await js(`(() => { const i = document.getElementById('qo-input'); i.value = 'trn'; i.dispatchEvent(new Event('input')); })(); null`); await wait(200);
        log('editor quick open "trn" ->', await js(`qo.list.slice(0, 2).join(', ')`));
        await shot('e5-quickopen');
        await js(`document.getElementById('quickopen').close(); null`);
        // path confinement
        log('editor read outside project ->', await js(`window.ide.files.read(${JSON.stringify(pidE)}, '../../../../etc/hosts').then(() => 'ALLOWED (bad)', e => 'blocked')`));
        // split toggle off
        await js(`activate(S.tabs.find(t => isFile(t) && t.relPath === 'src/train.py').id); toggleSplit(); null`); await wait(300);
        log('editor split after toggle ->', await js(`JSON.stringify(S.splits[${JSON.stringify(pidE)}] || null)`));
        await js(`toggleSplit(); null`); await wait(300);
      }
      // IDE_SMOKE_AGENT=1: draw Claude's real on-screen states into the Claude tab while
      // viewing another tab, and check the detected agent status at each step.
      if (process.env.IDE_SMOKE_AGENT) {
        await js(`S.settings.notify = false; activate(S.tabs[0].id); null`);
        await wait(300);
        const draw = (txt) => js(`(() => { const t = S.tabs[1]; t.term.write(${JSON.stringify(txt)});
          return new Promise(r => setTimeout(() => { evalAgent(t); r(t.agent); }, 200)); })()`);
        const pad = '\r\n'.repeat(30);
        log('agent 1 thinking  ->', await draw(pad + '✻ Pondering… (12s · ↑ 1.2k tokens · esc to interrupt)\r\n'));
        await shot('a1-working');
        log('agent 2 permission->', await draw(pad + ' Bash command\r\n   npm test\r\n\r\n Do you want to proceed?\r\n ❯ 1. Yes\r\n   2. Yes, and don\'t ask again for npm test commands\r\n   3. No, and tell Claude what to do differently (esc)\r\n'));
        log('dock badge count  ->', await js(`S.tabs.filter(t => t.agent === 'needs').length`));
        await shot('a2-needs');
        log('agent 3 working   ->', await draw(pad + '✻ Running… (esc to interrupt)\r\n'));
        log('agent 4 finished  ->', await draw(pad + '╭──────────╮\r\n│ >        │\r\n╰──────────╯\r\n'));
        await shot('a3-done');
        await js(`activate(S.tabs[1].id); null`); await wait(200);
        log('agent 5 viewed    ->', await js(`S.tabs[1].agent`));
        await js(`activate(S.tabs[0].id); S.tabs[1].term.reset(); S.tabs[1].agent = null; null`);
        log('agent 6 top-of-screen ->', await draw('\r\n> fix it\r\n\r\n✻ Thinking… (2s · esc to interrupt)\r\n'));
      }
      // IDE_SMOKE_PROFILE=1: measure renderer+GPU CPU (Electron's own metrics) under variants.
      if (process.env.IDE_SMOKE_PROFILE) {
        await js(`activate(S.tabs[1].id); null`);
        win.focus();
        const variants = [
          ['as shipped', ''],
          ['animals paused', `document.body.classList.add('paused')`],
          ['+ no cursor blink', `S.tabs.forEach(t => t.term.options.cursorBlink = false)`],
          ['+ animals removed', `document.querySelectorAll('.critters').forEach(e => e.remove())`],
        ];
        for (const [name, code] of variants) {
          if (code) await js(code + '; null');
          await wait(3000);
          app.getAppMetrics();
          log('mark start', name);
          await wait(15000);
          log('mark end', name);
          const m = app.getAppMetrics();
          const by = m.map(x => `${x.type}=${x.cpu.percentCPUUsage.toFixed(1)}`).join(' ');
          log('profile', name.padEnd(20), 'total=' + m.reduce((a, x) => a + x.cpu.percentCPUUsage, 0).toFixed(1) + '%', by);
        }
      }
      const idle = +process.env.IDE_SMOKE_IDLE || 0;
      if (idle) {
        await js(`activate(S.tabs[1].id); null`);
        win.focus(); log('phase focused', Date.now()); await wait(idle * 500);
        win.blur(); win.webContents.executeJavaScript('updatePaused()'); log('phase background', Date.now()); await wait(idle * 500);
        log('phase end', Date.now());
      }
    } catch (e) {
      log('ERROR', e.stack || e);
    }
    app.quit();
  });
};
