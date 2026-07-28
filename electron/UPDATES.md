# מסך קיוסק (Electron) — התקנה ועדכונים

## התקנה על מחשב המסך

1. בנו installer: `npm run dist` → הקובץ ב־`release/screensmart-Setup-….exe`
2. התקינו על מחשב המסך (Windows)
3. בהפעלה ראשונה יופיע מסך **רישום** — הזינו מזהה בית כנסת (וכתובת שרת אם צריך; ברירת מחדל Render)
4. יופיע splash «רשום למסך…» ואז המסך החי מהשרת

## הפעלה עם Windows

שתי שכבות:

1. **Electron** — `openAtLogin: true` (ברירת מחדל). לביטול: בקובץ `kiosk.json` הגדירו `"openAtLogin": false`
2. **NSIS** — קיצור דרך בתיקיית Startup (`screensmart.lnk`) נוצר בהתקנה

## איפה נשמר המזהה

`kiosk.json` בתיקיית userData של האפליקציה, בדרך כלל:

`%APPDATA%\screensmart\kiosk.json`

(בבילד ארוז ייתכן גם `%APPDATA%\screensmart Kiosk\kiosk.json` — חפשו לפי שם המוצר)

דוגמה:

```json
{
  "shulId": "12",
  "serverUrl": "https://www.screensmart.co.il",
  "openAtLogin": true,
  "registeredAt": "2026-07-27T10:00:00.000Z"
}
```

תבנית: [`kiosk.example.json`](./kiosk.example.json)

## קיצורי מקלדת

| קיצור | פעולה |
|--------|--------|
| `Ctrl+Shift+Q` | יציאה מהקיוסק |
| `Ctrl+Shift+S` | פתיחת מסך ההגדרות (שינוי מזהה / שרת) |

## מצב לא מקוון

אם השרת לא זמין, התוכנה מנסה לטעון את `dist` המקומי שנארז ב־installer (`#/display/{shulId}?kiosk=1`) וממשיכה לנסות להתחבר ברקע.

לוגים: `%APPDATA%\screensmart\kiosk.log` (או תיקיית userData המקבילה)

## סטטוס «מחובר» בניהול

הקיוסק שולח heartbeat לשרת כל ~25 שניות (גם מתהליך Electron הראשי). בסוכנות מסך נחשב מחובר אם התקבל heartbeat ב־90 השניות האחרונות.

**חשוב:** ה־`shulId` ב־`kiosk.json` חייב להיות **בדיוק** מזהה בית הכנסת במערכת (כמו בכתובת `/display/...`), לא שם תצוגה חופשי.

## עדכוני אפליקציה (stub)

עדכונים אוטומטיים לא פעילים כרגע (כדי לשמור על קלילות). עדכוני **תוכן המסך** מגיעים מהשרת בלי להתקין מחדש.

להפעלת `electron-updater` בעתיד:

1. `npm i electron-updater`
2. ב־`main.cjs` אחרי `app.whenReady` (כבר יש stub):

```js
const { autoUpdater } = require('electron-updater');
autoUpdater.checkForUpdatesAndNotify();
```

3. פרסום גרסאות דרך electron-builder / GitHub Releases

עד אז: בנו מחדש והפיצו את ה־Setup ידנית.
