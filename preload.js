// Bezpieczny most między oknem a systemem
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  state: (domains) => ipcRenderer.invoke('state', domains),
  apply: (managed, block) => ipcRenderer.invoke('apply', { managed, block }),
  restore: () => ipcRenderer.invoke('restore'),
  ping: (domain) => ipcRenderer.invoke('ping', domain),
  openHosts: () => ipcRenderer.send('open-hosts'),
  confirm: (title, message, ok) => ipcRenderer.invoke('confirm', { title, message, ok })
});
