# Auto-updates (stub)

In production builds, wire `electron-updater`:

1. `npm i electron-updater`
2. In `electron/main.cjs` after `app.whenReady`:

```js
const { autoUpdater } = require('electron-updater');
autoUpdater.checkForUpdatesAndNotify();
```

3. Publish releases via electron-builder / GitHub Releases.

Until then, rebuild and redistribute the kiosk package manually.
