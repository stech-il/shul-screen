import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CITIES } from '../data/cities';
import { createDefaultConfig } from '../data/defaults';
import { listSynagogueIds, loadLocal, saveConfig, isSupabaseConfigured } from '../lib/storage';
import './Home.css';

function slugify(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\u0590-\u05FFa-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .slice(0, 40) || `shul-${Date.now().toString(36)}`
  );
}

export function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [cityId, setCityId] = useState('petah-tikva');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const existing = listSynagogueIds()
    .map((id) => loadLocal(id)?.config)
    .filter(Boolean);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const id = slugify(name);
    const config = await createDefaultConfig(
      id,
      name.trim(),
      cityId,
      password || 'admin123',
      username || 'admin',
    );
    await saveConfig(config);
    navigate(`/login/${id}`);
  }

  return (
    <div className="home" dir="rtl" lang="he">
      <section className="hero">
        <p className="eyebrow">מסך בית כנסת</p>
        <h1>מסך אחד. הרבה בתי כנסת.</h1>
        <p className="lead">
          תצוגה במסך מלא, ניהול עם הרשאות, סנכרון ענן עם גיבוי מקומי, זמנים מ־Hebcal, תבניות
          ומיתוג לכל קהילה.
        </p>
        <p className="lead cloud-note">
          ענן:{' '}
          {isSupabaseConfigured
            ? 'Supabase מחובר'
            : 'מצב הדגמה — חבר Supabase דרך .env.local'}
        </p>
      </section>

      <div className="home-grid">
        <form className="panel" onSubmit={onCreate}>
          <h2>הקמת בית כנסת חדש</h2>
          <label>
            שם בית הכנסת
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: קהילת עמישב"
              required
            />
          </label>
          <label>
            עיר
            <select value={cityId} onChange={(e) => setCityId(e.target.value)}>
              {CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            שם משתמש מנהל
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              dir="ltr"
              style={{ textAlign: 'left' }}
              autoComplete="username"
            />
          </label>
          <label>
            סיסמת מנהל
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              dir="ltr"
              style={{ textAlign: 'left' }}
              autoComplete="new-password"
            />
          </label>
          <button type="submit" className="btn primary">
            צור והמשך לכניסה
          </button>
        </form>

        <div className="panel">
          <h2>קישורים מהירים</h2>
          <ul className="links">
            <li>
              <Link to="/display/amishav">מסך הדגמה — עמישב</Link>
              <Link className="sub" to="/login/amishav">
                ניהול
              </Link>
            </li>
            <li>
              <Link to="/display/amishav?kiosk=1">מצב קיוסק</Link>
              <span className="sub">מסך מלא</span>
            </li>
            <li>
              <Link to="/agency">דשבורד סוכנות</Link>
              <span className="sub">רישיון + לקוחות</span>
            </li>
            {existing
              .filter((c) => c && c.id !== 'amishav')
              .map((c) => (
                <li key={c!.id}>
                  <Link to={`/display/${c!.id}`}>{c!.name}</Link>
                  <Link className="sub" to={`/login/${c!.id}`}>
                    ניהול
                  </Link>
                </li>
              ))}
          </ul>
          <p className="note">
            Electron לקיוסק בטלוויזיה: הרץ <code>npm run dev</code> ואז{' '}
            <code>npm run electron:dev</code>. יציאה: Ctrl+Shift+Q + PIN קיוסק.
          </p>
        </div>
      </div>
    </div>
  );
}
