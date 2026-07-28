import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { SiteFooter } from '../components/SiteFooter';
import './Landing.css';

const WHATSAPP = 'https://wa.me/972524521527';
const PHONE_TEL = 'tel:0524521527';
const PHONE_LABEL = '052-4521527';
const MONTHLY = 99;

const FEATURES = [
  'זמני תפילות ימי חול ושבת',
  'עדכון המסך מהטלפון מכל מקום',
  'זמני היום והלוח העברי',
  'כניסת שבת, צאת שבת והדלקת נרות',
  'חגים וראשי חודשים אוטומטיים',
  'הודעות לציבור ולוח מודעות',
  'פרשת השבוע והדף היומי',
  'עילוי נשמות ויארצייט',
  'התראות פיקוד העורף באולם',
  'מצב קיוסק למסך מלא כל היום',
  'עיצוב מותאם עם בונה מסך',
  'ספירת העומר וזמנים לפי העיר',
] as const;

const SHOWCASES = [
  {
    id: 'weekday',
    title: 'זמני תפילה וזמני היום',
    text: 'שחרית, מנחה וערבית לצד עלות השחר, שקיעה וצאת הכוכבים — מחושבים לפי העיר של בית הכנסת.',
    image: '/template-bgs/jerusalem-stone.webp',
  },
  {
    id: 'holidays',
    title: 'חגים וראשי חודשים',
    text: 'המסך מציג אוטומטית חגים ותאריכים עבריים: פסח, ראש השנה, יום כיפור, סוכות, חנוכה, פורים, ספירת העומר ועוד.',
    image: '/template-bgs/gold-sanctuary.webp',
  },
  {
    id: 'community',
    title: 'הודעות, תורה וקהילה',
    text: 'לוח מודעות, דבר תורה, פרשת השבוע, עילוי נשמות ורפואת החולים — מתעדכנים מרחוק בלי לגעת במסך.',
    image: '/template-bgs/ark-wood.webp',
  },
  {
    id: 'oref',
    title: 'פיקוד העורף באולם',
    text: 'כשיש אזעקה באזור בית הכנסת — התראה ברורה על המסך, כדי שהמתפללים יידעו בזמן אמת.',
    image: '/template-bgs/shabbat-night.webp',
  },
] as const;

const SEO_TITLE = 'מסך זמנים לבית כנסת | screensmart — לוח זמנים והודעות חכם';
const SEO_DESC =
  'מסך תצוגה חכם לבתי כנסת: זמני תפילה, הודעות, חגים ופיקוד העורף. עדכון מרחוק מהטלפון. מנוי חודשי פשוט מ־screensmart.';

export function Landing() {
  useEffect(() => {
    document.title = SEO_TITLE;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', SEO_DESC);
  }, []);

  return (
    <div className="landing" dir="rtl" lang="he">
      <header className="landing-topbar">
        <a className="landing-topbar-brand" href="#top" aria-label="screensmart — מסך לבית כנסת">
          <BrandLogo size="sm" withWordmark />
        </a>
        <nav className="landing-topbar-nav" aria-label="ניווט ראשי">
          <a href="#about">אודות המסך</a>
          <a href="#features">יתרונות</a>
          <a href="#screens">סוגי מסכים</a>
          <a href="#manage">המערכת</a>
          <a href="#pricing">מחיר</a>
        </nav>
        <div className="landing-topbar-actions">
          <a className="landing-topbar-phone" href={PHONE_TEL} dir="ltr">
            {PHONE_LABEL}
          </a>
          <a className="landing-btn primary compact" href={WHATSAPP} target="_blank" rel="noreferrer">
            הזמינו עכשיו
          </a>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="top" aria-label="פתיחה">
          <div className="landing-hero-media" aria-hidden="true">
            <img
              src="/template-bgs/gold-columns.webp"
              alt=""
              className="landing-hero-photo"
              width={1920}
              height={1080}
              fetchPriority="high"
            />
            <div className="landing-hero-shade" />
          </div>

          <div className="landing-hero-center">
            <p className="landing-brand">screensmart</p>
            <h1>מסך זמנים חכם לבית כנסת</h1>
            <p className="landing-lead">
              לוח זמנים והודעות שמתעדכן מהטלפון — זמני תפילה, חגים ופיקוד העורף במסך אחד.
            </p>
            <div className="landing-cta-row">
              <a className="landing-btn primary lg" href={WHATSAPP} target="_blank" rel="noreferrer">
                הזמינו עכשיו
              </a>
              <a className="landing-btn ghost-light lg" href="#features">
                מה כולל המסך
              </a>
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

        <section className="landing-about" id="about" aria-labelledby="about-title">
          <div className="landing-about-inner">
            <p className="landing-kicker">אודות המסך</p>
            <h2 id="about-title">לוח זמנים חכם לבתי כנסת</h2>
            <div className="landing-prose">
              <p>
                <strong>screensmart</strong> הוא מסך תצוגה לבית כנסת שמציג זמני תפילה, הודעות לציבור
                ומידע משתנה לאורך היום — בלי להחליף ידנית לוח בכל שבוע. מזינים פעם אחת בפאנל הניהול,
                והמסך יודע להציג את הנכון לפי השעה, היום והלוח העברי.
              </p>
              <p>
                התוכנה נשלטת מרחוק מכל מקום: עדכון הודעה מהטלפון מופיע מיד על המסך באולם. כך חוסכים
                זמן יקר לגבאים ולרבנים, והמתפללים תמיד מעודכנים — בזמני חול, בשבת, בחגים ובראשי חודשים.
              </p>
              <p>
                העיצוב מותאם לכל בית כנסת: מסך זמנים מודרני, קריא מרחוק, עם אפשרות לעיצוב אישי בבונה
                המסך. זה פתרון מסך זמנים והודעות שמשפר את חוויית הקהילה ומחזיק את האולם מעודכן כל
                השנה.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-features-block" id="features" aria-labelledby="features-title">
          <div className="landing-features-inner">
            <div className="landing-features-head">
              <p className="landing-kicker on-dark">יתרונות</p>
              <h2 id="features-title">כל מה שצריך במסך אחד</h2>
              <p className="landing-section-lead on-dark">
                מסך זמנים לבית כנסת שמכסה את יום החול, השבת והחגים — כולל התראות חירום.
              </p>
            </div>
            <ul className="landing-checklist">
              {FEATURES.map((item, i) => (
                <li key={item}>
                  <span className="landing-check-num" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="landing-showcases" id="screens" aria-labelledby="screens-title">
          <div className="landing-showcases-head">
            <p className="landing-kicker">סוגי מסכים</p>
            <h2 id="screens-title">מסכי זמנים והודעות לכל ימות השנה</h2>
            <p className="landing-section-lead">
              תצוגה ברורה לקהל — זמני תפילות חול ושבת, שיעורים, כניסת ויציאת שבת, ועוד.
            </p>
          </div>
          {SHOWCASES.map((item, index) => (
            <article
              key={item.id}
              className={`landing-showcase ${index % 2 === 1 ? 'flip' : ''}`}
              aria-labelledby={`${item.id}-title`}
            >
              <div className="landing-showcase-media" aria-hidden="true">
                <img src={item.image} alt="" width={1200} height={800} loading="lazy" />
              </div>
              <div className="landing-showcase-copy">
                <h3 id={`${item.id}-title`}>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="landing-manage" id="manage" aria-labelledby="manage-title">
          <div className="landing-manage-inner">
            <p className="landing-kicker on-dark">המערכת</p>
            <h2 id="manage-title">מערכת ניהול קלה מהטלפון</h2>
            <p>
              עדכנו את מסך בית הכנסת מכל מקום ובכל זמן: הודעות, זמנים, עיצוב ומעבר בין תצוגות —
              בפאנל בעברית שמתוכנן לגבאים. החיבור בענן, והמסך בקיוסק ממשיך לרוץ באולם.
            </p>
            <a className="landing-btn primary lg" href={WHATSAPP} target="_blank" rel="noreferrer">
              לשאול על התקנה
            </a>
          </div>
        </section>

        <section className="landing-pricing" id="pricing" aria-labelledby="pricing-title">
          <div className="landing-pricing-inner">
            <p className="landing-kicker">מנוי חודשי</p>
            <h2 id="pricing-title">מחיר פשוט למסך אחד</h2>
            <p className="landing-section-lead">מסלול אחד לבתי כנסת — בלי הפתעות.</p>
            <p className="landing-price">
              <strong>{MONTHLY}</strong>
              <span>₪ לחודש</span>
            </p>
            <p className="landing-price-note">כולל מע״מ · כולל עדכונים ותמיכה</p>
            <ul className="landing-price-includes">
              <li>מסך ענן + פאנל ניהול בעברית</li>
              <li>התראות פיקוד העורף</li>
              <li>הוראת קבע באשראי</li>
            </ul>
            <a className="landing-btn primary lg" href={WHATSAPP} target="_blank" rel="noreferrer">
              הזמינו בוואטסאפ
            </a>
            <p className="landing-hardware-note">
              החומרה (טלוויזיה / מחשב מיני) נרכשת בנפרד — נשמח לייעץ מה מתאים לאולם.
            </p>
          </div>
        </section>

        <section className="landing-contact" id="contact" aria-labelledby="contact-title">
          <h2 id="contact-title">השאירו פנייה ונחזור אליכם</h2>
          <p>
            רוצים מסך זמנים לבית הכנסת? דברו בוואטסאפ או חייגו — נחזור בעברית במהירות.
          </p>
          <div className="landing-cta-row">
            <a className="landing-btn primary lg" href={WHATSAPP} target="_blank" rel="noreferrer">
              וואטסאפ
            </a>
            <a className="landing-btn outline lg" href={PHONE_TEL} dir="ltr">
              {PHONE_LABEL}
            </a>
          </div>
          <p className="landing-admin-link">
            <Link to="/admin">כניסת מנהל מערכת</Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
