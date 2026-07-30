# screensmart — מסך בית כנסת

תוכנה להצגת מסך דיגיטלי בבתי כנסת — גרסה 0.3.

## יכולות עיקריות

- מסך תצוגה (דפדפן / PWA / Electron קיוסק / Android APK)
- ניהול עם **שם משתמש וסיסמה** (salted hash)
- **רישיון מסך** לכל בית כנסת (נעילת תצוגה בלי מפתח תקף)
- **מנהל מערכת** חובה ליצירת בתי כנסת חדשים
- סנכרון ענן (Supabase) + גיבוי מקומי + תור אופליין
- זמני היום לפי עיר, נוסחים (אשכנז / ספרד / עדות המזרח / חב״ד)
- יארצייט, חגים, ימי זיכרון
- התראות פיקוד העורף לפי עיר + צליל
- מדיה (לוגו / רקע / אירוע) עם **גלריה משותפת ופופאפ בחירה**
- מצבי אירוע ואבל
- **בונה מסך חופשי** — העלאת רקע וגרירת ווידג׳טים לכל מקום במסך
- היסטוריית שינויים, תצוגה חיה, רישוי, אנליטיקה, heartbeat מסכים
- דשבורד סוכנות + סטטוס מסכים מחוברים

## הרצה

```bash
npm install
npm run dev
```

- בית: `/`
- מסך: `/display/12`
- ניהול בית כנסת: `/login/12` → `admin` / `admin123`
- מנהל מערכת (יצירת בתי כנסת): `superadmin` / `ShulAdmin2026!` או `admin` / `a5744084a` (ניתן לשנות ב־`.env`)
- סוכנות: `/agency` (דורש מנהל מערכת)

### בונה מסך חופשי

ניהול → לשונית **בונה מסך**:

- העלאת רקע מותאם (עד 1.5MB) + שליטה בכהות והתאמה
- הוספת ווידג׳טים (שעון, זמנים, בלוקים, הודעות, טקסט, תמונה ועוד)
- גרירה למיקום, שינוי גודל מהפינה, הצמדה לרשת (Alt מבטל)
- חיצים להזזה מדויקת, Shift+חיצים לקפיצה, Delete למחיקה
- מיקום נשמר באחוזים — זהה בכל גודל מסך
- «הפעל במסך התצוגה» מגדיר `layout = canvas`

### בדיקות

```bash
npm test
```

### Electron קיוסק + התקנה ל־Windows

הנתיב הראשי למסך פיזי — תוכנת קיוסק קלילה (לא דפדפן). סקריפט `kiosk/start-kiosk.bat` נשאר כגיבוי בלבד.

```bash
npm run electron:dev
npm run dist
```

ה־installer נוצר בתיקיית `release/` (`screensmart-Setup-….exe`).

**על מחשב המסך:** התקינו → בהפעלה ראשונה הזינו מזהה בית כנסת → התוכנה נרשמת מקומית, עולה עם Windows, מציגה «רשום…» עד שהשרת זמין, ואז טוענת את המסך החי.

| | |
|--|--|
| הגדרות מקומיות | `%APPDATA%\screensmart\kiosk.json` |
| שינוי מזהה | `Ctrl+Shift+S` |
| יציאה | `Ctrl+Shift+Q` |

פירוט: [`electron/UPDATES.md`](electron/UPDATES.md)

### Android קיוסק (Capacitor)

```bash
npm run android:sync
npm run android:open
# או: npm run android:apk
```

פרטים: [android/README.md](android/README.md). בפתיחה ראשונה — רישום מזהה ב־`/kiosk-setup`.

## חיבור Supabase

1. צור פרויקט ב־[supabase.com](https://supabase.com)
2. הרץ את `supabase/schema.sql` ב־SQL Editor (כולל bucket `shul-media`)
3. העתק `.env.example` ל־`.env.local` והשלם URL + anon key
4. ודא ב־Storage שיש bucket ציבורי בשם **`shul-media`** (אחרת תמונות לא יישמרו בשרת)
5. הפעל מחדש את `npm run dev`

בלי Supabase המערכת עובדת במצב הדגמה מקומי — קבצים נשמרים בדפדפן בלבד.

## פריסה ל־Render + GitHub

### 1. GitHub

```bash
cd screen
git init
git add .
git commit -m "Initial commit: screensmart app"
# צור ריפו ריק ב-GitHub ואז:
git branch -M main
git remote add origin https://github.com/USER/screensmart.git
git push -u origin main
```

### 2. Render

1. היכנס ל־[render.com](https://render.com) → **New** → **Blueprint** (או Web Service)
2. חבר את הריפו מ־GitHub
3. אם Blueprint: ייטען `render.yaml` אוטומטית
4. אם ידני:
   - **Build:** `npm ci && npm run build`
   - **Start:** `npm start`
   - **Health check:** `/healthz`
5. Environment (אופציונלי, נדרש לסנכרון ענן):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - חשוב: משתני `VITE_*` נכנסים ב־**build**, אחרי שינוי יש לעשות Redeploy

השרת (`server.mjs`) מגיש את `dist/` ומפרוקסי את התראות פיקוד העורף ב־`/api/oref/alerts`.

