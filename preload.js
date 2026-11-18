const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('ide', {
  pathForFile: (file) => webUtils.getPathForFile(file),
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    pick: () => ipcRenderer.invoke('projects:pick'),
    add: (dir) => ipcRenderer.invoke('projects:add', dir),
    remove: (id) => ipcRenderer.invoke('projects:remove', id),
    update: (id, patch) => ipcRenderer.invoke('projects:update', id, patch),
    discover: () => ipcRenderer.invoke('projects:discover'),
    reveal: (dir) => ipcRenderer.invoke('projects:reveal', dir),
  },
  pty: {
    create: (opts) => ipcRenderer.invoke('pty:create', opts),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('pty:kill', id),
    onData: (cb) => ipcRenderer.on('pty:data', (_e, id, data) => cb(id, data)),
    onExit: (cb) => ipcRenderer.on('pty:exit', (_e, id, code) => cb(id, code)),
  },
  onStatus: (cb) => ipcRenderer.on('tabs:status', (_e, s) => cb(s)),
  focusWindow: () => ipcRenderer.send('win:focus'),
  files: (() => {
    const call = (...a) => ipcRenderer.invoke(...a).then(r => { if (r && r.error) throw new Error(r.error); return r; });
    return {
      list: (pid, rel) => call('fs:list', pid, rel),
      all: (pid) => call('fs:all', pid),
      read: (pid, rel) => call('fs:read', pid, rel),
      write: (pid, rel, text, mtime, force) => call('fs:write', pid, rel, text, mtime, force),
      watch: (pid, rel, mtime) => ipcRenderer.send('fs:watch', pid, rel, mtime),
      unwatch: (pid, rel) => ipcRenderer.send('fs:unwatch', pid, rel),
      onChanged: (cb) => ipcRenderer.on('fs:changed', (_e, pid, rel, mtime) => cb(pid, rel, mtime)),
    };
  })(),
  setBadge: (n) => ipcRenderer.send('dock:badge', n),
  bounce: () => ipcRenderer.send('dock:bounce'),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
  },
});
