# Android kiosk wrapper

The live synagogue screen is a HashRouter web app. Point a WebView / TWA / Capacitor shell at:

```text
https://YOUR-HOST/#/display/{shulId}?kiosk=1
```

See [android/README.md](../android/README.md) (Hebrew) for Capacitor and Bubblewrap steps. Full native scaffolding can be added later; CI does not need the Android SDK for the web app.
