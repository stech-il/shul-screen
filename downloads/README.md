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

קבצי `.exe` / `.apk` לא נשמרים ב־git (גדולים מדי). אחרי דיפלוי:

1. העלו את הקבצים לתיקיית `downloads/` בדיסק השרת, **או**
2. הגדירו כתובות חיצוניות:

```
DOWNLOAD_WINDOWS_URL=https://…/screensmart-Setup.exe
DOWNLOAD_ANDROID_URL=https://…/screensmart-kiosk.apk
DOWNLOAD_ANDROID_MANAGE_URL=https://…/screensmart-manage.apk
```

בניהול → הגדרות → «התקנת אפליקציות» מופיעים כפתורי ההורדה.
