// Builds a standalone "Claude IDE.app" into out/, ad-hoc signs it, and (with --install)
// copies it to ~/Applications and puts a shortcut on the Desktop.
// Run: npm run package   (or: npm run install-app)
const { packager } = require('@electron/packager');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

(async () => {
  const root = path.join(__dirname, '..');
  const [appDir] = await packager({
    dir: root,
    out: path.join(root, 'out'),
    name: 'Claude IDE',
    appBundleId: 'local.claude-ide',
    appCategoryType: 'public.app-category.developer-tools',
    icon: path.join(root, 'build', 'icon.icns'),
    platform: 'darwin',
    arch: process.arch,
    overwrite: true,
    asar: false, // node-pty's native binary and spawn-helper must stay plain files
    prune: true,
    ignore: [/^\/out($|\/)/, /^\/build\/icon\.iconset($|\/)/, /^\/scripts\/(make-icon|package)\.js$/],
  });
  const appPath = path.join(appDir, 'Claude IDE.app');
  // Re-sign after modifying the Electron bundle so Apple Silicon will run it.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  console.log('built', appPath);

  if (process.argv.includes('--install')) {
    const apps = path.join(os.homedir(), 'Applications');
    fs.mkdirSync(apps, { recursive: true });
    const dest = path.join(apps, 'Claude IDE.app');
    fs.rmSync(dest, { recursive: true, force: true });
    execFileSync('ditto', [appPath, dest]);
    // Finder alias on the Desktop (survives the app being moved within ~/Applications).
    const desk = path.join(os.homedir(), 'Desktop');
    if (!fs.existsSync(path.join(desk, 'Claude IDE'))) {
      execFileSync('osascript', ['-e',
        `tell application "Finder" to make alias file to POSIX file "${dest}" at POSIX file "${desk}"`,
        '-e', `tell application "Finder" to set name of result to "Claude IDE"`]);
    }
    console.log('installed', dest);
  }
})().catch(e => { console.error(e); process.exit(1); });
