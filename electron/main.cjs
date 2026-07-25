const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

/** Hardened kiosk for synagogue TV / PC */
function readLocalConfig() {
  try {
    const p = path.join(app.getPath('userData'), 'kiosk.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    /* ignore */
  }
  return {};
}

function appendLog(line) {
  try {
    const p = path.join(app.getPath('userData'), 'kiosk.log');
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    /* ignore */
  }
}

function fetchOrefAlertsText() {
  return new Promise((resolve, reject) => {
    const req = https.get(
      'https://www.oref.org.il/WarningMessages/alert/alerts.json',
      {
        headers: {
          Referer: 'https://www.oref.org.il/',
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('oref timeout'));
    });
  });
}

ipcMain.handle('kiosk-exit', () => {
  appendLog('exit requested');
  app.quit();
});

ipcMain.handle('oref-alerts', async () => {
  try {
    return await fetchOrefAlertsText();
  } catch (e) {
    appendLog(`oref error: ${e && e.message ? e.message : e}`);
    return '';
  }
});

ipcMain.handle('kiosk-log', (_e, msg) => {
  appendLog(String(msg));
  return true;
});

function createWindow() {
  const cfg = readLocalConfig();
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#0f1c22',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startUrl =
    process.env.ELECTRON_START_URL ||
    `file://${path.join(__dirname, '..', 'dist', 'index.html').replace(/\\/g, '/')}`;

  const shulId = process.env.SHUL_ID || cfg.shulId || 'amishav';
  const base = startUrl.replace(/\/$/, '');
  const url = `${base}/#/display/${shulId}?kiosk=1`;

  appendLog(`load ${url}`);
  win.loadURL(url);

  globalShortcut.register('Control+Shift+Q', () => {
    win.webContents.send('request-kiosk-exit');
  });

  win.webContents.on('did-finish-load', () => {
    appendLog('ready');
  });

  // Optional auto-updater when electron-updater is installed in production
  try {
    if (app.isPackaged) {
      // eslint-disable-next-line global-require
      const { autoUpdater } = require('electron-updater');
      autoUpdater.checkForUpdatesAndNotify();
      appendLog('autoUpdater checked');
    }
  } catch {
    appendLog('autoUpdater not available');
  }
}

// Windows: optional auto-launch with OS
try {
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
    args: [],
  });
} catch {
  /* ignore on non-windows / unpackaged */
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
