import { Link } from 'react-router-dom';
import { isPlatformAdminLoggedIn } from '../lib/platformAuth';
import { listSynagogueIds, loadLocal, isSupabaseConfigured } from '../lib/storage';
import './Home.css';

/** Public landing — platform management is only via /#/admin → /#/agency */
export function Home() {
  const platformOk = isPlatformAdminLoggedIn();
  const existing = listSynagogueIds()
    .map((id) => loadLocal(id)?.config)
    .filter(Boolean);

  return (
    <div className="home" dir="rtl" lang="he">
      <section className="hero">
        <p className="eyebrow">מסך בית כנסת</p>
        <h1>מסך אחד. הרבה בתי כנסת.</h1>
        <p className="lead">
          תצוגה במסך מלא, ניהול עם הרשאות, סנכרון ענן, זמנים מ־Hebcal ותבניות לכל קהילה.
        </p>
        <p className="lead cloud-note">
          ענן:{' '}
          {isSupabaseConfigured
            ? 'Supabase מחובר'
            : 'מצב הדגמה — חבר Supabase דרך .env.local'}
        </p>
        <p className="hero-cta-row">
          <Link className="btn primary hero-agency-cta" to="/admin">
            {platformOk ? 'לפאנל הניהול' : 'כניסת מנהל מערכת'}
          </Link>
        </p>
        <p className="hint admin-path-hint">
          כתובת ניהול על:{' '}
          <code dir="ltr">/#/admin</code>
        </p>
      </section>

      <div className="home-grid">
        <div className="panel">
          <h2>קישורים מהירים</h2>
          <ul className="links">
            <li>
              <Link to="/display/amishav">מסך הדגמה — עמישב</Link>
              <Link className="sub" to="/login/amishav">
                ניהול בית כנסת
              </Link>
            </li>
            <li>
              <Link to="/display/amishav?kiosk=1">מצב קיוסק</Link>
              <span className="sub">מסך מלא</span>
            </li>
            <li>
              <Link to="/admin">ניהול על</Link>
              <span className="sub">בתי כנסת · רישיונות · השבתה</span>
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
