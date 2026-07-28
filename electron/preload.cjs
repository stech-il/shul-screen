const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shulKiosk', {
  isElectron: true,
  requestExit: () => ipcRenderer.invoke('kiosk-exit'),
  onExitRequest: (cb) => {
    ipcRenderer.on('request-kiosk-exit', () => cb());
  },
  fetchOrefAlerts: () => ipcRenderer.invoke('oref-alerts'),
  log: (msg) => ipcRenderer.invoke('kiosk-log', msg),
  getConfig: () => ipcRenderer.invoke('kiosk-get-config'),
  saveConfig: (body) => ipcRenderer.invoke('kiosk-save-config', body),
  continueToSplash: () => ipcRenderer.invoke('kiosk-continue-splash'),
  openSetup: () => ipcRenderer.invoke('kiosk-open-setup'),
  connectAndLoad: () => ipcRenderer.invoke('kiosk-connect-and-load'),
});
