import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { SiteFooter } from '../components/SiteFooter';
import './Landing.css';

const WHATSAPP = 'https://wa.me/972524521527';
const PHONE_TEL = 'tel:0524521527';
const PHONE_LABEL = '052-4521527';
const MONTHLY = 99;

export function Landing() {
  return (
    <div className="landing" dir="rtl" lang="he">
      <header className="landing-nav">
        <a className="landing-nav-brand" href="#top" aria-label="screensmart">
          <BrandLogo size="sm" />
        </a>
        <nav className="landing-nav-links" aria-label="ניווט">
          <a href="#what">יכולות</a>
          <a href="#how">איך זה עובד</a>
          <a href="#pricing">מחיר</a>
          <a className="landing-nav-cta" href={WHATSAPP} target="_blank" rel="noreferrer">
            דברו איתנו
          </a>
        </nav>
      </header>

      <section className="landing-hero" id="top" aria-label="פתיחה">
        <div className="landing-hero-media" aria-hidden="true">
          <img
            src="/template-bgs/jerusalem-stone.webp"
            alt=""
            className="landing-hero-photo"
          />
          <div className="landing-hero-shade" />
        </div>

        <div className="landing-hero-inner">
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

          <div className="landing-hero-product" aria-hidden="true">
            <div className="landing-screen">
              <div className="landing-screen-bezel">
                <div className="landing-screen-glass">
                  <header className="ls-top">
                    <p className="ls-shul">קהילת מרכז</p>
                    <p className="ls-date">כ״ב בניסן</p>
                  </header>
                  <p className="ls-clock">18:42</p>
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
        </div>
      </section>

      <section className="landing-section" id="what">
        <div className="landing-section-intro">
          <p className="landing-kicker">המסך באולם</p>
          <h2>מה מופיע על המסך</h2>
          <p className="landing-section-lead">
            תצוגה ברורה לקהל — בלי אפליקציות מסובכות ובלי תלות במחשב מקומי.
          </p>
        </div>
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
        <div className="landing-section-intro">
          <p className="landing-kicker">התחלה פשוטה</p>
          <h2>איך זה עובד</h2>
          <p className="landing-section-lead">שלושה צעדים — והמסך באוויר.</p>
        </div>
        <ol className="landing-steps">
          <li>
            <span className="landing-step-num" aria-hidden="true">
              01
            </span>
            <div>
              <strong>טלוויזיה ומחשב קטן</strong>
              <p>מחברים לקיוסק — אנחנו מלווים בהתקנה</p>
            </div>
          </li>
          <li>
            <span className="landing-step-num" aria-hidden="true">
              02
            </span>
            <div>
              <strong>מגדירים את בית הכנסת</strong>
              <p>עיר, זמנים, עיצוב והודעות — מפאנל ניהול בעברית</p>
            </div>
          </li>
          <li>
            <span className="landing-step-num" aria-hidden="true">
              03
            </span>
            <div>
              <strong>מעדכנים מכל מקום</strong>
              <p>שינוי בטלפון מופיע על המסך בלי לנסוע לבית הכנסת</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="landing-pricing" id="pricing">
        <div className="landing-pricing-inner">
          <p className="landing-kicker">מנוי חודשי</p>
          <h2>מחיר פשוט</h2>
          <p className="landing-section-lead">מסלול אחד — בלי הפתעות.</p>
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
          <p className="landing-hardware-note">
            החומרה (טלוויזיה / מחשב מיני) נרכשת בנפרד — נשמח לייעץ מה מתאים לאולם.
          </p>
        </div>
      </section>

      <section className="landing-section landing-contact" id="contact">
        <div className="landing-section-intro">
          <h2>מוכנים להתחיל?</h2>
          <p className="landing-section-lead">
            נחזור אליכם מהר, בעברית. לקוחות קיימים — פתיחת פנייה מתוך ניהול המסך.
          </p>
        </div>
        <div className="landing-cta-row">
          <a className="landing-btn primary" href={WHATSAPP} target="_blank" rel="noreferrer">
            וואטסאפ
          </a>
          <a className="landing-btn ghost" href={PHONE_TEL} dir="ltr">
            {PHONE_LABEL}
          </a>
        </div>
        <p className="landing-admin-link">
          <Link to="/admin">כניסת מנהל מערכת</Link>
        </p>
      </section>

      <SiteFooter />
    </div>
  );
}
