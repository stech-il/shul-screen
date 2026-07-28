# Android kiosk (Capacitor)

Native Android shell for the live HashRouter web app.

```text
https://YOUR-HOST/#/display/{shulId}?kiosk=1
```

Full Hebrew build steps: [android/README.md](../android/README.md).

Quick start:

```bash
npm run android:sync
npm run android:open
```

Then Build APK in Android Studio. First launch opens `/#/kiosk-setup` to save synagogue id on device.
