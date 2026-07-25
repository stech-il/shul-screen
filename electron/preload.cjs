const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shulKiosk', {
  isElectron: true,
  requestExit: () => ipcRenderer.invoke('kiosk-exit'),
  onExitRequest: (cb) => {
    ipcRenderer.on('request-kiosk-exit', () => cb());
  },
  fetchOrefAlerts: () => ipcRenderer.invoke('oref-alerts'),
  log: (msg) => ipcRenderer.invoke('kiosk-log', msg),
});
