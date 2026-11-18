// Renders build/icon.html to a 1024px PNG, then builds build/icon.icns with sips + iconutil.
// Run: ELECTRON_RUN_AS_NODE= npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false,
    useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(__dirname, '..', 'build', 'icon.html'));
  await new Promise(r => setTimeout(r, 800));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const build = path.join(__dirname, '..', 'build');
  const png = path.join(build, 'icon.png');
  fs.writeFileSync(png, img.resize({ width: 1024, height: 1024 }).toPNG());
  const set = path.join(build, 'icon.iconset');
  fs.rmSync(set, { recursive: true, force: true });
  fs.mkdirSync(set);
  for (const s of [16, 32, 128, 256, 512]) {
    execFileSync('sips', ['-z', String(s), String(s), png, '--out', path.join(set, `icon_${s}x${s}.png`)], { stdio: 'ignore' });
    execFileSync('sips', ['-z', String(s * 2), String(s * 2), png, '--out', path.join(set, `icon_${s}x${s}@2x.png`)], { stdio: 'ignore' });
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(build, 'icon.icns')]);
  console.log('wrote', path.join(build, 'icon.icns'));
  app.quit();
});
