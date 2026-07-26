# smartech — מסך בית כנסת

תוכנה להצגת מסך דיגיטלי בבתי כנסת — גרסה 0.3.

## יכולות עיקריות

- מסך תצוגה (דפדפן / PWA / Electron קיוסק + installer)
- ניהול עם **שם משתמש וסיסמה** (salted hash)
- **רישיון מסך** לכל בית כנסת (נעילת תצוגה בלי מפתח תקף)
- **מנהל מערכת** חובה ליצירת בתי כנסת חדשים
- סנכרון ענן (Supabase) + גיבוי מקומי + תור אופליין
- זמנים מ־Hebcal, נוסחים (אשכנז / ספרד / עדות המזרח / חב״ד)
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

- בית: `/#/`
- מסך: `/#/display/amishav`
- ניהול בית כנסת: `/#/login/amishav` → `admin` / `admin123`
- מנהל מערכת (יצירת בתי כנסת): `superadmin` / `ShulAdmin2026!` (ניתן לשנות ב־`.env` / בדף הבית)
- סוכנות: `/#/agency` (דורש מנהל מערכת)

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

```bash
npm run electron:dev
npm run dist
```

ה־installer נוצר בתיקיית `release/`.

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
git commit -m "Initial commit: smartech app"
# צור ריפו ריק ב-GitHub ואז:
git branch -M main
git remote add origin https://github.com/USER/smartech.git
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

