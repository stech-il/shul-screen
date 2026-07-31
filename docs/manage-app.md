# אפליקציית ניהול מהטלפון (+ Google Play)

ניהול זמנים, הודעות והגדרות — **בלי** עיצוב מסך / בונה קנבס / מדיה / נוסח.

| | קיוסק (בית המדרש) | ניהול (טלפון) |
|---|---|---|
| `applicationId` | `il.screensmart.app` | `il.screensmart.manage` |
| כיוון | landscape | portrait |
| פתיחה | מסך תצוגה | `/manage` |
| חנות | לא חייב | מיועד ל־Google Play |

## שימוש מיידי באתר / PWA

`https://www.screensmart.co.il/manage`

## בניית APK לבדיקה (ניהול)

```bash
npm run android:manage-apk
```

קובץ:

`android/app/build/outputs/apk/manage/debug/app-manage-debug.apk`

## העלאה ל־Google Play (AAB חתום)

### 1. יצירת מפתח חתימה (פעם אחת)

ב־PowerShell מתיקיית `android/`:

```powershell
keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias screensmart
```

העתיקו `keystore.properties.example` → `keystore.properties` ומלאו סיסמאות.
שימו את `upload-keystore.jks` בתיקיית `android/app/` (או עדכנו את `storeFile`).

**שמרו את ה־keystore והסיסמאות בכספת** — בלי זה אי אפשר לעדכן את האפליקציה בחנות.

הוסיפו ל־`.gitignore` (כבר מומלץ): `*.jks`, `keystore.properties`.

### 2. בניית App Bundle

```bash
npm run android:manage-bundle
```

קובץ להעלאה:

`android/app/build/outputs/bundle/manageRelease/app-manage-release.aab`

### 3. Google Play Console

1. Create app → שם: **screensmart ניהול**
2. Package name: **`il.screensmart.manage`** (חייב להתאים)
3. העלו את ה־AAB ל־Production / Internal testing
4. מלאו מדיניות פרטיות, צילומי מסך לטלפון, תיאור קצר בעברית

### מדיניות פרטיות (טיוטה)

אפשר לפרסם דף באתר, למשל: האפליקציה מתחברת ל־screensmart.co.il לניהול מסך בית הכנסת; נשמרים פרטי התחברות במכשיר; אין מכירת נתונים.

## APK קיוסק (לא לחנות)

```bash
npm run android:apk
```

## הערות

- אחרי `cap sync` עם `VITE_APP_SHELL=manage`, ה־`capacitor.config` מצביע ל־`il.screensmart.manage`.
- לחזרה לקיוסק: `npm run android:sync` (בלי VITE_APP_SHELL).
- שתי האפליקציות יכולות להיות מותקנות יחד במכשיר.
