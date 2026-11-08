const { app, BrowserWindow, globalShortcut, ipcMain, shell, crashReporter } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const os = require('os');

const DEFAULT_SERVER = 'https://www.screensmart.co.il';
const LOG_MAX_BYTES = 2 * 1024 * 1024;

/** @type {BrowserWindow | null} */
let mainWindow = null;
let memTimer = null;
let reloadAfterCrashTimer = null;

function configPath() {
  return path.join(app.getPath('userData'), 'kiosk.json');
}

function logPath() {
  return path.join(app.getPath('userData'), 'kiosk.log');
}

function crashLogPath() {
  return path.join(app.getPath('userData'), 'kiosk-crash.log');
}

function rotateLogIfNeeded(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size < LOG_MAX_BYTES) return;
    const bak = `${filePath}.1`;
    try {
      if (fs.existsSync(bak)) fs.unlinkSync(bak);
    } catch {
      /* ignore */
    }
    fs.renameSync(filePath, bak);
  } catch {
    /* ignore */
  }
}

function appendLog(line) {
  try {
    if (!app.isReady()) {
      console.error(`[kiosk] ${line}`);
      return;
    }
    const p = logPath();
    rotateLogIfNeeded(p);
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${line}\n`);
  } catch (err) {
    console.error(`[kiosk-log-fail] ${line}`, err);
  }
}

function appendCrash(line) {
  try {
    if (!app.isReady()) {
      console.error(`[kiosk-crash] ${line}`);
      return;
    }
    const p = crashLogPath();
    rotateLogIfNeeded(p);
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${line}\n`);
    appendLog(`CRASH ${line}`);
  } catch (err) {
    console.error(`[kiosk-crash-fail] ${line}`, err);
  }
}

function systemSnapshot() {
  try {
    const freemem = Math.round(os.freemem() / (1024 * 1024));
    const totalmem = Math.round(os.totalmem() / (1024 * 1024));
    return `freeMb=${freemem} totalMb=${totalmem} platform=${process.platform} arch=${process.arch} electron=${process.versions.electron} chrome=${process.versions.chrome}`;
  } catch (err) {
    return `snapshot-failed ${err?.message || err}`;
  }
}

async function logProcessMemory(tag = 'mem') {
  try {
    const info = await process.getProcessMemoryInfo();
    const metrics = mainWindow && !mainWindow.isDestroyed()
      ? await mainWindow.webContents.getProcessMemoryInfo()
      : null;
    appendLog(
      `${tag} mainPrivateMb=${Math.round((info.private || 0) / 1024)} mainResidentMb=${Math.round((info.residentSet || 0) / 1024)} rendererPrivateMb=${metrics ? Math.round((metrics.private || 0) / 1024) : '-'} ${systemSnapshot()}`,
    );
  } catch (err) {
    appendLog(`${tag} failed ${err?.message || err}`);
  }
}

function scheduleRendererReload(reason) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (reloadAfterCrashTimer) clearTimeout(reloadAfterCrashTimer);
  appendCrash(`reload-scheduled reason=${reason}`);
  reloadAfterCrashTimer = setTimeout(() => {
    reloadAfterCrashTimer = null;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      appendLog(`reload-now reason=${reason}`);
      void connectAndLoad();
    } catch (err) {
      appendCrash(`reload-failed ${err?.message || err}`);
      try {
        mainWindow.reload();
      } catch {
        /* ignore */
      }
    }
  }, 1500);
}

function attachWindowDiagnostics(win) {
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    appendLog(`did-fail-load code=${code} main=${isMainFrame} desc=${desc} url=${url}`);
    if (isMainFrame && code !== -3 /* aborted */) {
      scheduleRendererReload(`did-fail-load:${code}`);
    }
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    appendCrash(
      `render-process-gone reason=${details?.reason || '?'} exitCode=${details?.exitCode ?? '?'} ${systemSnapshot()}`,
    );
    void logProcessMemory('mem-after-gone');
    scheduleRendererReload(`render-gone:${details?.reason || 'unknown'}`);
  });

  win.webContents.on('unresponsive', () => {
    appendCrash(`renderer-unresponsive ${systemSnapshot()}`);
  });

  win.webContents.on('responsive', () => {
    appendLog('renderer-responsive-again');
  });

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level < 2) return;
    const lvl = level >= 3 ? 'error' : 'warn';
    appendLog(`console-${lvl} ${String(message || '').slice(0, 400)} @${sourceId || ''}:${line || 0}`);
  });

  win.on('unresponsive', () => {
    appendCrash(`window-unresponsive ${systemSnapshot()}`);
  });
}

function readLocalConfig() {
  try {
    const p = configPath();
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      return raw && typeof raw === 'object' ? raw : {};
    }
  } catch {
    /* ignore */
  }
  return {};
}

function writeLocalConfig(patch) {
  const prev = readLocalConfig();
  const next = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (next.shulId && !prev.shulId) {
    next.registeredAt = next.registeredAt || new Date().toISOString();
  }
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function normalizeServerUrl(url) {
  return String(url || DEFAULT_SERVER)
    .trim()
    .replace(/\/$/, '');
}

function resolveServerUrl(_cfg) {
  // Local electron:dev only — production kiosk is always locked to screensmart.co.il
  if (process.env.ELECTRON_START_URL) {
    return normalizeServerUrl(process.env.ELECTRON_START_URL);
  }
  return DEFAULT_SERVER;
}

function displayUrl(cfg) {
  const server = resolveServerUrl(cfg);
  const shulId = encodeURIComponent(String(cfg.shulId || '').trim());
  return `${server}/display/${shulId}?kiosk=1`;
}

function offlineDisplayUrl(cfg) {
  const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');
  if (!fs.existsSync(indexHtml)) return null;
  const shulId = encodeURIComponent(String(cfg.shulId || '').trim());
  const fileUrl = `file://${indexHtml.replace(/\\/g, '/')}`;
  return `${fileUrl}#/display/${shulId}?kiosk=1`;
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

function probeServer(serverUrl, timeoutMs = 18000) {
  return new Promise((resolve) => {
    const base = normalizeServerUrl(serverUrl);
    const candidates = [
      `${base}/healthz`,
      `${base}/api/cloud/status`,
      `${base}/api/cloud/heartbeats`,
      `${base}/`,
    ];
    let left = candidates.length;
    let ok = false;

    function done(success) {
      if (ok) return;
      if (success) {
        ok = true;
        resolve(true);
        return;
      }
      left -= 1;
      if (left <= 0) resolve(false);
    }

    for (const url of candidates) {
      try {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { timeout: timeoutMs }, (res) => {
          res.resume();
          done(res.statusCode >= 200 && res.statusCode < 500);
        });
        req.on('error', () => done(false));
        req.on('timeout', () => {
          req.destroy();
          done(false);
        });
      } catch {
        done(false);
      }
    }
  });
}

async function probeConnection({ serverUrl, shulId }) {
  const base = normalizeServerUrl(serverUrl);
  const id = String(shulId || '').trim();
  const serverOk = await probeServer(base, 12000);
  let configOk = false;
  let configStatus = 0;
  let configDetail = '';

  if (serverOk && id) {
    const url = `${base}/api/cloud/synagogues/${encodeURIComponent(id)}`;
    try {
      const result = await httpJson('GET', url);
      configStatus = result.status;
      if (result.status === 200) {
        try {
          const body = JSON.parse(result.body || '{}');
          configOk = Boolean(body?.config?.id || body?.config);
          configDetail = configOk ? 'found' : 'empty';
        } catch {
          configOk = false;
          configDetail = 'bad-json';
        }
      } else if (result.status === 404) {
        configDetail = 'not-found';
      } else {
        configDetail = `http-${result.status}`;
      }
    } catch (err) {
      configDetail = String(err?.message || err);
    }
  } else if (!id) {
    configDetail = 'missing-id';
  } else {
    configDetail = 'server-down';
  }

  return {
    ok: serverOk,
    server: { ok: serverOk },
    config: { ok: configOk, status: configStatus, detail: configDetail },
  };
}

async function probeServerReliable(serverUrl) {
  for (let i = 0; i < 3; i++) {
    appendLog(`probe attempt ${i + 1}`);
    if (await probeServer(serverUrl, 20000)) return true;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return false;
}

function httpJson(method, urlStr, bodyObj) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (err) {
      reject(err);
      return;
    }
    const lib = u.protocol === 'https:' ? https : http;
    const data = bodyObj != null ? Buffer.from(JSON.stringify(bodyObj), 'utf8') : null;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method,
        headers: {
          Accept: 'application/json',
          ...(data
            ? {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': data.length,
              }
            : {}),
        },
        timeout: 20000,
      },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          buf += c;
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, body: buf }));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (data) req.write(data);
    req.end();
  });
}

let heartbeatTimer = null;

async function postMainHeartbeat() {
  const cfg = readLocalConfig();
  const shulId = String(cfg.shulId || '').trim();
  if (!shulId) return false;
  const serverUrl = resolveServerUrl(cfg);
  try {
    const result = await httpJson('POST', `${serverUrl}/api/cloud/heartbeats`, {
      synagogueId: shulId,
      at: new Date().toISOString(),
      version: app.getVersion?.() || '0.3.1',
      online: true,
      layout: 'electron-kiosk',
    });
    if (result.status >= 200 && result.status < 300) {
      appendLog(`heartbeat ok ${shulId}`);
      return true;
    }
    appendLog(`heartbeat http ${result.status}`);
    return false;
  } catch (err) {
    appendLog(`heartbeat fail ${err?.message || err}`);
    return false;
  }
}

function startMainHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  void postMainHeartbeat();
  heartbeatTimer = setInterval(() => {
    void postMainHeartbeat();
  }, 25_000);
}

function stopMainHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function assetUrl(name) {
  return `file://${path.join(__dirname, name).replace(/\\/g, '/')}`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
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
      // Needed for file:// offline shell talking to remote APIs when online again
      webSecurity: true,
    },
  });

  attachWindowDiagnostics(mainWindow);
  bootRoute();
}

function bootRoute() {
  const cfg = readLocalConfig();
  const shulId = String(cfg.shulId || process.env.SHUL_ID || '').trim();
  if (!shulId) {
    appendLog('no shulId — setup');
    stopMainHeartbeat();
    mainWindow.loadURL(assetUrl('setup.html'));
    return;
  }
  // Presence even while splash loads — Agency sees "מחובר"
  startMainHeartbeat();
  appendLog(`splash for ${shulId}`);
  mainWindow.loadURL(assetUrl('splash.html'));
}

async function connectAndLoad() {
  const cfg = readLocalConfig();
  const shulId = String(cfg.shulId || '').trim();
  if (!shulId) {
    stopMainHeartbeat();
    mainWindow.loadURL(assetUrl('setup.html'));
    return { mode: 'setup', error: 'חסר מזהה' };
  }

  startMainHeartbeat();

  const serverUrl = resolveServerUrl(cfg);
  appendLog(`probe ${serverUrl}`);
  const online = await probeServerReliable(serverUrl);

  if (online) {
    const url = displayUrl({ ...cfg, serverUrl });
    writeLocalConfig({ lastGoodUrl: url, serverUrl: cfg.serverUrl || serverUrl, lastOnlineAt: new Date().toISOString() });
    appendLog(`load online ${url}`);
    mainWindow.loadURL(url);
    return { mode: 'online', url };
  }

  const offline = offlineDisplayUrl(cfg);
  if (offline) {
    appendLog(`load offline ${offline}`);
    writeLocalConfig({ lastOfflineAt: new Date().toISOString() });
    mainWindow.loadURL(offline);
    // Keep retrying server in background
    scheduleOnlineRetry(serverUrl, cfg);
    return { mode: 'offline', url: offline };
  }

  const last = cfg.lastGoodUrl;
  if (last) {
    appendLog(`load lastGoodUrl ${last}`);
    mainWindow.loadURL(last);
    scheduleOnlineRetry(serverUrl, cfg);
    return { mode: 'offline', url: last };
  }

  appendLog('no offline fallback — stay on splash retry');
  return { mode: 'error', error: 'אין רשת ואין מטמון מקומי — בודקים שוב…' };
}

let retryTimer = null;
function scheduleOnlineRetry(serverUrl, cfg) {
  if (retryTimer) clearInterval(retryTimer);
  retryTimer = setInterval(async () => {
    const ok = await probeServer(serverUrl, 8000);
    if (!ok || !mainWindow || mainWindow.isDestroyed()) return;
    clearInterval(retryTimer);
    retryTimer = null;
    const url = displayUrl({ ...cfg, serverUrl });
    writeLocalConfig({ lastGoodUrl: url, lastOnlineAt: new Date().toISOString() });
    appendLog(`retry online ${url}`);
    mainWindow.loadURL(url);
  }, 20000);
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

ipcMain.handle('kiosk-get-config', () => {
  const cfg = readLocalConfig();
  return {
    shulId: cfg.shulId || '',
    serverUrl: DEFAULT_SERVER,
    registeredAt: cfg.registeredAt || null,
    openAtLogin: Boolean(cfg.openAtLogin !== false),
  };
});

ipcMain.handle('kiosk-save-config', (_e, body) => {
  try {
    const shulId = String(body?.shulId || '')
      .trim()
      .slice(0, 80);
    if (!shulId || shulId.length < 2) {
      return { ok: false, error: 'מזהה קצר מדי' };
    }
    const saved = writeLocalConfig({ shulId, serverUrl: DEFAULT_SERVER });
    appendLog(`config saved ${shulId} → ${DEFAULT_SERVER}`);
    startMainHeartbeat();
    return { ok: true, config: saved };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('kiosk-probe-connection', async (_e, body) => {
  try {
    return await probeConnection({
      serverUrl: DEFAULT_SERVER,
      shulId: body?.shulId,
    });
  } catch (err) {
    appendLog(`probe-connection error ${err?.message || err}`);
    return {
      ok: false,
      server: { ok: false },
      config: { ok: false, status: 0, detail: String(err?.message || err) },
      error: String(err?.message || err),
    };
  }
});

ipcMain.handle('kiosk-continue-splash', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
  mainWindow.loadURL(assetUrl('splash.html'));
  return { ok: true };
});

ipcMain.handle('kiosk-open-setup', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
  mainWindow.loadURL(assetUrl('setup.html'));
  return { ok: true };
});

ipcMain.handle('kiosk-connect-and-load', async () => {
  try {
    return await connectAndLoad();
  } catch (err) {
    appendLog(`connect error ${err?.message || err}`);
    return { mode: 'error', error: String(err?.message || err) };
  }
});

ipcMain.handle('kiosk-open-logs', async () => {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(logPath())) appendLog('log-file-created');
    await shell.openPath(dir);
    appendLog('opened log folder');
    return { ok: true, dir, log: logPath(), crash: crashLogPath() };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('kiosk-get-log-paths', () => ({
  dir: app.getPath('userData'),
  log: logPath(),
  crash: crashLogPath(),
}));

function registerShortcuts() {
  globalShortcut.register('Control+Shift+Q', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('request-kiosk-exit');
    }
  });
  globalShortcut.register('Control+Shift+S', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      appendLog('open setup shortcut');
      mainWindow.loadURL(assetUrl('setup.html'));
    }
  });
  globalShortcut.register('Control+Shift+L', () => {
    appendLog('open logs shortcut');
    void shell.openPath(app.getPath('userData'));
  });
}

try {
  crashReporter.start({
    productName: 'screensmart-kiosk',
    companyName: 'screensmart',
    submitURL: '',
    uploadToServer: false,
    compress: true,
  });
} catch (err) {
  // crashReporter may fail in unpackaged/dev; keep going
  appendLog(`crashReporter start skipped: ${err?.message || err}`);
}

process.on('uncaughtException', (err) => {
  appendCrash(`uncaughtException ${err?.stack || err?.message || err}`);
});

process.on('unhandledRejection', (reason) => {
  appendCrash(`unhandledRejection ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`);
});

app.whenReady().then(() => {
  appendLog(`app-ready ${systemSnapshot()} version=${app.getVersion?.() || '?'}`);
  void logProcessMemory('mem-boot');

  const cfg = readLocalConfig();
  const openAtLogin = cfg.openAtLogin !== false;
  try {
    app.setLoginItemSettings({
      openAtLogin,
      path: process.execPath,
      args: [],
    });
    appendLog(`openAtLogin=${openAtLogin}`);
  } catch (err) {
    appendLog(`login item failed: ${err?.message || err}`);
  }

  createWindow();
  registerShortcuts();

  if (memTimer) clearInterval(memTimer);
  memTimer = setInterval(() => {
    void logProcessMemory('mem');
  }, 15 * 60_000);

  // Optional updater stub — skipped when package is missing (keeps kiosk light)
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
});

app.on('child-process-gone', (_e, details) => {
  appendCrash(
    `child-process-gone type=${details?.type || '?'} reason=${details?.reason || '?'} exitCode=${details?.exitCode ?? '?'} name=${details?.name || ''}`,
  );
});

app.on('render-process-gone', (_e, _wc, details) => {
  appendCrash(
    `app-render-process-gone reason=${details?.reason || '?'} exitCode=${details?.exitCode ?? '?'}`,
  );
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (retryTimer) clearInterval(retryTimer);
  if (memTimer) clearInterval(memTimer);
  if (reloadAfterCrashTimer) clearTimeout(reloadAfterCrashTimer);
  stopMainHeartbeat();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (retryTimer) clearInterval(retryTimer);
  if (memTimer) clearInterval(memTimer);
  if (reloadAfterCrashTimer) clearTimeout(reloadAfterCrashTimer);
  stopMainHeartbeat();
  appendLog('will-quit');
});
