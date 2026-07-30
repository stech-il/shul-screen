# אפליקציית Android (Capacitor) — screensmart

שתי מעטפות מאותו פרויקט:

| Flavor | חבילה | שימוש |
|--------|--------|--------|
| **kiosk** | `il.screensmart.app` | מסך אולם (landscape, immersive) |
| **manage** | `il.screensmart.manage` | ניהול מהטלפון → Google Play |

מדריך מלא לניהול + Play Store: [docs/manage-app.md](../docs/manage-app.md).

## דרישות

1. **Node 20+** (כבר בפרויקט)
2. **Android Studio** (Ladybug / חדש יותר) עם Android SDK + JDK 17 מומלץ
3. אחרי התקנת Studio: הגדירו `ANDROID_HOME` (או פתחו פרויקטים מתוך Studio בלבד)

## בניית APK קיוסק

```bash
npm run android:sync
npm run android:apk
```

קובץ: `android/app/build/outputs/apk/kiosk/debug/app-kiosk-debug.apk`

## בניית אפליקציית ניהול (Play Store)

בדיקה:

```bash
npm run android:manage-apk
```

להעלאה לחנות (AAB חתום — ראו `docs/manage-app.md`):

```bash
npm run android:manage-bundle
```

## איך זה עובד

| רכיב | התנהגות |
|------|---------|
| `capacitor.config.ts` | לפי `VITE_APP_SHELL=manage` מחליף appId / שם |
| Flavor `manage` | portrait, בלי immersive, פתיחה ל־`/manage` |
| Flavor `kiosk` | landscape + keep-awake + מסך מלא |
| `/kiosk-setup` | רישום מזהה למסך אולם |
| `/manage` | כניסת ניהול מהטלפון |

## סקריפטים

- `npm run android:sync` — קיוסק
- `npm run android:apk` — APK קיוסק debug
- `npm run android:manage-sync` — build ניהול + sync
- `npm run android:manage-apk` — APK ניהול debug
- `npm run android:manage-bundle` — AAB ניהול release לחנות
- `npm run android:open` — Android Studio

## TWA (חלופה)

ראה גם [docs/android-kiosk.md](../docs/android-kiosk.md) ל־Bubblewrap / Trusted Web Activity אם מעדיפים מעטפת Chrome בלי Capacitor.
