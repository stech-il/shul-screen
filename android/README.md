# אפליקציית Android למסך בית כנסת

המסך החי הוא אתר Web (React) בכתובת התצוגה. באנדרואיד ממליצים לעטוף אותו ב־**WebView** או ב־**Trusted Web Activity (TWA)** — בלי לשכתב את לוגיקת הזמנים.

## גישות מומלצות

1. **Capacitor** — פרויקט native קל סביב ה־URL של production, עם WebView במסך מלא (קיוסק).
2. **Trusted Web Activity / Bubblewrap** — אפליקציה שמציגה את האתר ב־Chrome Custom Tabs במצב דמוי־אפליקציה (מתאים כשהאתר כבר ב־HTTPS).

בשלב זה אין פרויקט Capacitor מלא בריפו; אפשר להוסיף אותו בהמשך בלי לשבור את ה־CI (אין חובת Android SDK ב־pipeline).

## כתובת התצוגה

החליפו `{shulId}` במזהה בית הכנסת מהסוכנות:

```text
https://YOUR-PRODUCTION-HOST/#/display/{shulId}?kiosk=1
```

דוגמה:

```text
https://shul-screen.onrender.com/#/display/amishav?kiosk=1
```

`kiosk=1` מסמן מצב מסך מלא / קיוסק בצד האפליקציה.

## בניית APK (Capacitor — סקיצה)

לאחר התקנת Node ו־Android Studio מקומית (לא ב־CI אלא אם תרצו במפורש):

```bash
npm create @capacitor/app@latest screensmart-android
cd screensmart-android
npm install @capacitor/android
npx cap add android
```

ב־`capacitor.config` הגדירו `server.url` לכתובת ה־production עם `#/display/{shulId}?kiosk=1`, או טענו `index.html` שמפנה לכתובת הזו.

```bash
npx cap sync android
npx cap open android
```

ב־Android Studio: Build → Build Bundle(s) / APK(s).

### TWA עם Bubblewrap

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://YOUR-PRODUCTION-HOST/manifest.webmanifest
bubblewrap build
```

ודאו שיש PWA manifest + service worker אם נדרש ל־TWA מלא. לחלופין WebView פשוט מספיק לקיוסק באולם.

## טיפים לקיוסק באולם

- נעלו את המכשיר ל־kiosk / pinned app כדי שלא ייצאו מהמסך.
- השאירו את המסך דולק (אל תנו לישון אוטומטית בשעות פעילות).
- חיבור רשת יציב חובה לעדכוני ענן והתראות.
- מדריך התקנה כללי באתר: `/#/guide`.

## מה הלאה

אפשר להוסיף תיקיית `android/` מלאה עם Capacitor, אייקון, ו־intent לפתיחה אוטומטית של מזהה בית כנסת שנשמר בהגדרות המכשיר.
