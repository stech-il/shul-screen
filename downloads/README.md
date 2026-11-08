# קבצי הורדה — אפליקציות מסך

מכאן מערכת הניהול מגישה:

| קובץ | שימוש |
|------|--------|
| `screensmart-Setup.exe` | אפליקציית Windows (Electron) — עולה עם הפעלת המחשב, שומרת מטמון אופליין |
| `screensmart-kiosk.apk` | אפליקציית Android למסך — עולה אחרי אתחול, שומרת נתונים גם בלי אינטרנט |
| `screensmart-manage.apk` | (אופציונלי) אפליקציית ניהול לטלפון |
| `manifest.json` | מטא־דאטה לגרסה |

## עדכון קבצים אחרי בנייה

```bash
npm run dist
npm run android:apk
node scripts/publish-downloads.mjs
```

## פריסה בשרת (Render וכו׳)

קבצי `.exe` / `.apk` לא נשמרים ב־git. הקישורים הציבוריים נמצאים ב־`manifest.json`
וב־GitHub Release `v0.3.6-apps`, וגם ב־`render.yaml` כ־env.

אחרי בנייה מחדש:

```bash
npm run dist
npm run android:apk
npm run publish:downloads
gh release upload v0.3.6-apps downloads/screensmart-Setup.exe downloads/screensmart-kiosk.apk --clobber
```

עדכנו את ה־`url` ב־`downloads/manifest.json` (ואת `DOWNLOAD_*_URL` ב־`render.yaml` אם צריך).

בניהול → הגדרות → «התקנת אפליקציות» מופיעים כפתורי ההורדה.
