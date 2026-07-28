# אפליקציית Android (Capacitor) — screensmart

מעטפת WebView סביב האתר החי (כמו Electron ב־Windows): מסך מלא, landscape, מסך לא נרדם, ורישום מזהה בית כנסת במכשיר.

## דרישות

1. **Node 20+** (כבר בפרויקט)
2. **Android Studio** (Ladybug / חדש יותר) עם Android SDK + JDK 17 מומלץ
3. אחרי התקנת Studio: הגדירו `ANDROID_HOME` (או פתחו פרויקטים מתוך Studio בלבד)

## בניית APK (מקומי)

משורש הריפו:

```bash
npm run android:sync
npm run android:open
```

ב־Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

או מ־CLI (אחרי ש־SDK מותקן):

```bash
npm run android:apk
```

קובץ Debug יופיע בערך ב:

`android/app/build/outputs/apk/debug/app-debug.apk`

להתקנה על מכשיר מחובר ב־USB:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## איך זה עובד

| רכיב | התנהגות |
|------|---------|
| `capacitor.config.ts` | WebView מקומי בלבד — לא נפתח דפדפן חיצוני |
| `/#/kiosk-setup` | מסך רישום: מזהה בית כנסת + כתובת שרת |
| אחרי שמירה | מעבר ל־`/#/display/…` **בתוך האפליקציה** (מסך מלא) |
| API ענן | נשלח לכתובת השרת שנשמרה (בלי לעזוב את ה־WebView) |
| MainActivity | Immersive + `KEEP_SCREEN_ON` + landscape |

בפתיחה: אם אין מזהה שמור — מסך הרישום. אם יש מזהה — מסך התצוגה באפליקציה.

## סקריפטים ב־package.json

- `npm run android:sync` — build של האתר + `cap sync android`
- `npm run android:open` — פתיחה ב־Android Studio
- `npm run android:apk` — sync + `gradlew assembleDebug`

## מצב ללא שרת מרוחק (bundled)

```bash
# Windows PowerShell
$env:CAP_SERVER_URL=""; npm run android:sync
```

אז האפליקציה רצה מקבצי `dist` שב־APK. קריאות API צריכות עדיין רשת לשרת הענן (דרך הלוגיקה ב־`androidKiosk` / analytics).

## טיפים לקיוסק באולם

- נעלו את האפליקציה (pin / kiosk mode) כדי שלא ייצאו מהמסך
- חיבור רשת יציב לעדכוני ענן והתראות
- מדריך כללי באתר: `/#/guide`

## TWA (חלופה)

ראה גם [docs/android-kiosk.md](../docs/android-kiosk.md) ל־Bubblewrap / Trusted Web Activity אם מעדיפים מעטפת Chrome בלי Capacitor.
