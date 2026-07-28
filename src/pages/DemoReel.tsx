import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import './DemoReel.css';

const WHATSAPP = 'https://wa.me/972524521527?text=' + encodeURIComponent('שלום, אשמח לפרטים על מסך screensmart לבית הכנסת');

type Scene = {
  id: string;
  durationMs: number;
  kicker: string;
  title: string;
  text: string;
  visual: 'brand' | 'hall' | 'phone' | 'admin' | 'features' | 'cta';
};

const SCENES: Scene[] = [
  {
    id: 'intro',
    durationMs: 5500,
    kicker: 'screensmart',
    title: 'מסך זמנים חכם לבית כנסת',
    text: 'לוח זמנים והודעות שמתעדכן מהטלפון — ברור לקהל, פשוט לגבאי.',
    visual: 'brand',
  },
  {
    id: 'hall',
    durationMs: 7000,
    kicker: 'באולם',
    title: 'המסך מול הקהל',
    text: 'שעון, זמני תפילה, לוח עברי והודעות — קריא גם מהשורה האחרונה.',
    visual: 'hall',
  },
  {
    id: 'phone',
    durationMs: 7000,
    kicker: 'מהטלפון',
    title: 'עדכון מרחוק בשניות',
    text: 'משנים הודעה או זמן תפילה בניהול — והמסך באולם מתעדכן מיד.',
    visual: 'phone',
  },
  {
    id: 'admin',
    durationMs: 7500,
    kicker: 'מערכת ניהול',
    title: 'פאנל בעברית לגבאים',
    text: 'משתמשים והרשאות, עיצוב המסך, הודעות, יארצייט, רישיון ותמיכה — במקום אחד.',
    visual: 'admin',
  },
  {
    id: 'features',
    durationMs: 8500,
    kicker: 'הכל במסך אחד',
    title: 'חול · שבת · חגים · חירום',
    text: 'זמני היום, כניסת שבת, חגים אוטומטיים, פרשת השבוע, והתראות פיקוד העורף באולם.',
    visual: 'features',
  },
  {
    id: 'cta',
    durationMs: 8000,
    kicker: 'התחילו בקלות',
    title: '₪99 לחודש כולל מע״מ',
    text: 'ענן + ניהול + תמיכה. חומרה נפרדת — נלווה אתכם בהתקנה.',
    visual: 'cta',
  },
];

const FEATURES = [
  'זמני תפילות חול ושבת',
  'עדכון מהטלפון',
  'לוח עברי וזמני היום',
  'חגים אוטומטיים',
  'הודעות לציבור',
  'פיקוד העורף',
];

export function DemoReel() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const startedAt = useRef(performance.now());
  const scene = SCENES[index]!;

  useEffect(() => {
    document.title = 'סרטון הדגמה | screensmart';
  }, []);

  useEffect(() => {
    startedAt.current = performance.now();
    setProgress(0);
  }, [index]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - startedAt.current;
      const pct = Math.min(1, elapsed / scene.durationMs);
      setProgress(pct);
      if (elapsed >= scene.durationMs) {
        setIndex((i) => (i + 1) % SCENES.length);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, scene.durationMs, index]);

  function go(delta: number) {
    setIndex((i) => (i + delta + SCENES.length) % SCENES.length);
  }

  return (
    <div className="demo-reel" dir="rtl" lang="he">
      <header className="demo-reel-top">
        <Link to="/" className="demo-reel-brand" aria-label="screensmart">
          <BrandLogo size="sm" />
        </Link>
        <p className="demo-reel-label">סרטון הדגמה ללקוחות</p>
        <Link to="/" className="demo-reel-exit">
          חזרה לאתר
        </Link>
      </header>

      <main className="demo-reel-stage" key={scene.id}>
        <div className={`demo-visual demo-visual--${scene.visual}`} aria-hidden>
          {scene.visual === 'brand' ? (
            <div className="demo-brand-mark">
              <img src="/screensmart-mark.png" alt="" width={120} height={120} />
              <span>screensmart</span>
            </div>
          ) : null}

          {scene.visual === 'hall' ? (
            <div className="demo-hall">
              <div className="demo-hall-screen">
                <div className="demo-hall-bar">
                  <span>בית הכנסת</span>
                  <span>כ״ב בניסן</span>
                </div>
                <p className="demo-hall-clock">07:42</p>
                <ul>
                  <li>
                    <span>שחרית</span>
                    <strong>06:30</strong>
                  </li>
                  <li>
                    <span>מנחה</span>
                    <strong>18:55</strong>
                  </li>
                  <li>
                    <span>ערבית</span>
                    <strong>19:25</strong>
                  </li>
                  <li>
                    <span>שקיעה</span>
                    <strong>19:11</strong>
                  </li>
                </ul>
              </div>
            </div>
          ) : null}

          {scene.visual === 'phone' ? (
            <div className="demo-phone-wrap">
              <div className="demo-phone">
                <p className="demo-phone-eyebrow">ניהול מסך</p>
                <p className="demo-phone-title">הודעה חדשה</p>
                <div className="demo-phone-field">שיעור אחרי ערבית · אולם גדול</div>
                <div className="demo-phone-btn">פרסם למסך</div>
                <p className="demo-phone-ok">עודכן באולם ✓</p>
              </div>
              <div className="demo-phone-tv" />
            </div>
          ) : null}

          {scene.visual === 'admin' ? (
            <div className="demo-admin">
              <aside>
                <span className="on">לוח זמנים</span>
                <span>הודעות</span>
                <span>עיצוב</span>
                <span>משתמשים</span>
              </aside>
              <section>
                <p>מזהה מסך · 12</p>
                <h3>פרסום למסך</h3>
                <div className="demo-admin-rows">
                  <i />
                  <i />
                  <i />
                </div>
              </section>
            </div>
          ) : null}

          {scene.visual === 'features' ? (
            <ul className="demo-features">
              {FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : null}

          {scene.visual === 'cta' ? (
            <div className="demo-cta-card">
              <p className="demo-cta-price">
                ₪99<span>/חודש</span>
              </p>
              <p>כולל מע״מ · עדכונים ותמיכה</p>
              <a className="demo-cta-wa" href={WHATSAPP} target="_blank" rel="noreferrer">
                הזמנה בוואטסאפ
              </a>
              <p className="demo-cta-url" dir="ltr">
                www.screensmart.co.il
              </p>
            </div>
          ) : null}
        </div>

        <div className="demo-copy">
          <p className="demo-kicker">{scene.kicker}</p>
          <h1>{scene.title}</h1>
          <p className="demo-text">{scene.text}</p>
        </div>
      </main>

      <footer className="demo-reel-controls">
        <div className="demo-progress" aria-hidden>
          {SCENES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={i === index ? 'active' : i < index ? 'done' : ''}
              onClick={() => setIndex(i)}
              aria-label={`סצנה ${i + 1}`}
            >
              <span
                style={
                  i === index
                    ? { transform: `scaleX(${progress})` }
                    : i < index
                      ? { transform: 'scaleX(1)' }
                      : undefined
                }
              />
            </button>
          ))}
        </div>
        <div className="demo-actions">
          <button type="button" onClick={() => go(-1)} aria-label="הקודם">
            הקודם
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'השהה' : 'הפעל'}
          >
            {playing ? 'השהה' : 'הפעל'}
          </button>
          <button type="button" onClick={() => go(1)} aria-label="הבא">
            הבא
          </button>
          <a className="wa" href={WHATSAPP} target="_blank" rel="noreferrer">
            וואטסאפ
          </a>
          <a className="wa" href="/demo/screensmart-demo.mp4" download="screensmart-demo.mp4">
            הורדת MP4
          </a>
        </div>
      </footer>
    </div>
  );
}
