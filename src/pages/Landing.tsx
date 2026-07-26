import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { SiteFooter } from '../components/SiteFooter';
import { INQUIRY_TOPIC_LABELS, submitInquiry, type InquiryTopic } from '../lib/inquiries';
import './Landing.css';

const WHATSAPP = 'https://wa.me/972524521527';
const PHONE_TEL = 'tel:0524521527';
const PHONE_LABEL = '052-4521527';
const MONTHLY = 99;

export function Landing() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [topic, setTopic] = useState<InquiryTopic>('general');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [formMsg, setFormMsg] = useState('');
  const [sent, setSent] = useState(false);

  async function onSubmitInquiry(e: FormEvent) {
    e.preventDefault();
    setFormMsg('');
    setBusy(true);
    try {
      await submitInquiry({
        name,
        email,
        phone,
        topic,
        message,
        source: 'landing',
      });
      setSent(true);
      setName('');
      setEmail('');
      setPhone('');
      setMessage('');
      setTopic('general');
      setFormMsg('הפנייה נשלחה — נחזור אליכם בהקדם.');
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : 'שליחת הפנייה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing" dir="rtl" lang="he">
      <header className="landing-nav">
        <p className="landing-nav-brand">screensmart</p>
        <a className="landing-nav-cta" href="#contact">
          דברו איתנו
        </a>
      </header>

      <section className="landing-hero" aria-label="פתיחה">
        <div className="landing-hero-copy">
          <p className="landing-brand">screensmart</p>
          <h1>המסך שבית הכנסת שלכם צריך</h1>
          <p className="landing-lead">
            זמני תפילה, הודעות ופיקוד העורף — על מסך אחד, מנוהל מהטלפון.
          </p>
          <div className="landing-cta-row">
            <a className="landing-btn primary" href={WHATSAPP} target="_blank" rel="noreferrer">
              התחילו בוואטסאפ
            </a>
            <a className="landing-btn ghost" href="#pricing">
              מחיר חודשי
            </a>
          </div>
        </div>

        <div className="landing-hero-visual" aria-hidden="true">
          <div className="landing-screen">
            <div className="landing-screen-bezel">
              <div className="landing-screen-glass">
                <p className="ls-shul">קהילת מרכז</p>
                <p className="ls-clock">18:42</p>
                <p className="ls-date">כ״ב בניסן · יום ראשון</p>
                <ul className="ls-zmanim">
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
                <p className="ls-note">שיעור אחרי ערבית · אולם גדול</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="what">
        <h2>מה המסך מציג</h2>
        <p className="landing-section-lead">
          תצוגה ברורה לאולם — בלי אפליקציות מסובכות ובלי תלות במחשב מקומי.
        </p>
        <ul className="landing-features">
          <li>
            <strong>זמנים והלוח העברי</strong>
            <span>זמני היום מתעדכנים אוטומטית לפי העיר שלכם</span>
          </li>
          <li>
            <strong>הודעות ולוח מודעות</strong>
            <span>עדכון מרחוק מהטלפון — מופיע מיד על המסך</span>
          </li>
          <li>
            <strong>התראות פיקוד העורף</strong>
            <span>התראה באולם כשיש אזעקה באזור בית הכנסת</span>
          </li>
          <li>
            <strong>מצב קיוסק</strong>
            <span>מסך מלא שממשיך לרוץ כל היום על הטלוויזיה</span>
          </li>
        </ul>
      </section>

      <section className="landing-section landing-how" id="how">
        <h2>איך זה עובד</h2>
        <p className="landing-section-lead">שלושה צעדים — והמסך באוויר.</p>
        <ol className="landing-steps">
          <li>
            <span className="landing-step-num">1</span>
            <div>
              <strong>טלוויזיה ומחשב קטן</strong>
              <p>מחברים לקיוסק — אנחנו מלווים בהתקנה</p>
            </div>
          </li>
          <li>
            <span className="landing-step-num">2</span>
            <div>
              <strong>מגדירים את בית הכנסת</strong>
              <p>עיר, זמנים, עיצוב והודעות — מפאנל ניהול בעברית</p>
            </div>
          </li>
          <li>
            <span className="landing-step-num">3</span>
            <div>
              <strong>מעדכנים מכל מקום</strong>
              <p>שינוי בטלפון מופיע על המסך בלי לנסוע לבית הכנסת</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="landing-section landing-pricing" id="pricing">
        <h2>מחיר פשוט</h2>
        <p className="landing-section-lead">מנוי חודשי אחד — בלי מסלולים ובלי הפתעות.</p>
        <div className="landing-price-block">
          <p className="landing-price">
            <strong>{MONTHLY}</strong>
            <span>₪ לחודש</span>
          </p>
          <p className="landing-price-note">כולל מע״מ · כולל עדכונים ותמיכה</p>
          <ul className="landing-price-includes">
            <li>מסך ענן + פאנל ניהול</li>
            <li>התראות פיקוד העורף</li>
            <li>הוראת קבע באשראי</li>
          </ul>
          <a className="landing-btn primary" href={WHATSAPP} target="_blank" rel="noreferrer">
            לשאול על התקנה
          </a>
        </div>
        <p className="landing-hardware-note">
          החומרה (טלוויזיה / מחשב מיני) נרכשת בנפרד — נשמח לייעץ מה מתאים לאולם שלכם.
        </p>
      </section>

      <section className="landing-section landing-contact" id="contact">
        <h2>מוכנים להתחיל?</h2>
        <p className="landing-section-lead">
          שלחו פנייה — היא מגיעה ישירות לפאנל המנהל, עם התראה במייל כש־SMTP מוגדר.
        </p>

        <form className="landing-inquiry" onSubmit={(e) => void onSubmitInquiry(e)}>
          <div className="landing-inquiry-grid">
            <label>
              שם מלא
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={120}
                placeholder="ישראל ישראלי"
                autoComplete="name"
              />
            </label>
            <label>
              מייל
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                dir="ltr"
                style={{ textAlign: 'left' }}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
            <label>
              טלפון
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                style={{ textAlign: 'left' }}
                placeholder="05X-XXX-XXXX"
                autoComplete="tel"
              />
            </label>
            <label>
              נושא
              <select value={topic} onChange={(e) => setTopic(e.target.value as InquiryTopic)}>
                {(Object.keys(INQUIRY_TOPIC_LABELS) as InquiryTopic[]).map((id) => (
                  <option key={id} value={id}>
                    {INQUIRY_TOPIC_LABELS[id]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="landing-inquiry-msg">
            הודעה
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              minLength={5}
              maxLength={4000}
              rows={4}
              placeholder="ספרו בקצרה במה נוכל לעזור…"
            />
          </label>
          <div className="landing-inquiry-actions">
            <button type="submit" className="landing-btn primary" disabled={busy || sent}>
              {busy ? 'שולח…' : sent ? 'נשלח' : 'שלחו פנייה'}
            </button>
            <a className="landing-btn ghost" href={WHATSAPP} target="_blank" rel="noreferrer">
              וואטסאפ
            </a>
            <a className="landing-btn ghost" href={PHONE_TEL} dir="ltr">
              {PHONE_LABEL}
            </a>
          </div>
          {formMsg ? (
            <p className={`landing-inquiry-status ${sent ? 'ok' : 'err'}`}>{formMsg}</p>
          ) : null}
        </form>

        <p className="landing-admin-link">
          <Link to="/admin">כניסת מנהל מערכת</Link>
        </p>
      </section>

      <SiteFooter />
    </div>
  );
}
