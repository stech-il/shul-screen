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
      <header className="landing-nav">
        <a className="landing-nav-brand" href="#top" aria-label="screensmart — מסך לבית כנסת">
          <BrandLogo size="sm" />
        </a>
        <nav className="landing-nav-links" aria-label="ניווט ראשי">
          <a href="#about">אודות המסך</a>
          <a href="#features">יתרונות</a>
          <a href="#screens">מה מוצג</a>
          <a href="#pricing">מחיר</a>
          <a className="landing-nav-cta" href={WHATSAPP} target="_blank" rel="noreferrer">
            הזמינו עכשיו
          </a>
        </nav>
      </header>

      <main>
        <section className="landing-hero" id="top" aria-label="פתיחה">
          <div className="landing-hero-media" aria-hidden="true">
            <img
              src="/template-bgs/jerusalem-stone.webp"
              alt=""
              className="landing-hero-photo"
              width={1920}
              height={1080}
              fetchPriority="high"
            />
            <div className="landing-hero-shade" />
          </div>

          <div className="landing-hero-inner">
            <div className="landing-hero-copy">
              <p className="landing-brand">screensmart</p>
              <h1>מסך זמנים חכם לבית כנסת</h1>
              <p className="landing-lead">
                לוח זמנים והודעות שמתעדכן מהטלפון — זמני תפילה, חגים ופיקוד העורף במסך אחד.
              </p>
              <div className="landing-cta-row">
                <a className="landing-btn primary" href={WHATSAPP} target="_blank" rel="noreferrer">
                  הזמינו עכשיו
                </a>
                <a className="landing-btn ghost" href="#features">
                  כל היתרונות
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

        <section className="landing-section landing-about" id="about" aria-labelledby="about-title">
          <div className="landing-section-intro">
            <p className="landing-kicker">אודות המסך</p>
            <h2 id="about-title">לוח זמנים חכם לבתי כנסת</h2>
          </div>
          <div className="landing-prose">
            <p>
              <strong>screensmart</strong> הוא מסך תצוגה לבית כנסת שמציג זמני תפילה, הודעות לציבור ומידע
              משתנה לאורך היום — בלי להחליף ידנית לוח בכל שבוע. מזינים פעם אחת בפאנל הניהול, והמסך
              יודע להציג את הנכון לפי השעה, היום והלוח העברי.
            </p>
            <p>
              התוכנה נשלטת מרחוק מכל מקום: עדכון הודעה מהטלפון מופיע מיד על המסך באולם. כך חוסכים זמן
              יקר לגבאים ולרבנים, והמתפללים תמיד מעודכנים — בזמני חול, בשבת, בחגים ובראשי חודשים.
            </p>
            <p>
              העיצוב מותאם לכל בית כנסת: מסך זמנים מודרני, קריא מרחוק, עם אפשרות לעיצוב אישי בבונה
              המסך. זה פתרון מסך זמנים והודעות שמשפר את חוויית הקהילה ומחזיק את האולם מעודכן כל השנה.
            </p>
          </div>
        </section>

        <section className="landing-band" id="features" aria-labelledby="features-title">
          <div className="landing-band-inner">
            <div className="landing-section-intro">
              <p className="landing-kicker">יתרונות</p>
              <h2 id="features-title">כל מה שצריך במסך אחד</h2>
              <p className="landing-section-lead">
                מסך זמנים לבית כנסת שמכסה את יום החול, השבת והחגים — כולל התראות חירום.
              </p>
            </div>
            <ul className="landing-checklist">
              {FEATURES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="landing-section" id="screens" aria-labelledby="screens-title">
          <div className="landing-section-intro">
            <p className="landing-kicker">מה מוצג</p>
            <h2 id="screens-title">מסכי זמנים והודעות לכל ימות השנה</h2>
            <p className="landing-section-lead">
              תצוגה ברורה לקהל — זמני תפילות חול ושבת, שיעורים, כניסת ויציאת שבת, ועוד.
            </p>
          </div>
          <ul className="landing-features">
            <li>
              <strong>זמני תפילה וזמני היום</strong>
              <span>
                שחרית, מנחה וערבית לצד עלות השחר, שקיעה וצאת הכוכבים — מחושבים לפי העיר של בית הכנסת.
              </span>
            </li>
            <li>
              <strong>חגים וראשי חודשים</strong>
              <span>
                המסך מציג אוטומטית חגים ותאריכים עבריים: פסח, שבועות, ראש השנה, יום כיפור, סוכות,
                חנוכה, פורים, ספירת העומר ועוד — בזמן הנכון.
              </span>
            </li>
            <li>
              <strong>הודעות, תורה וקהילה</strong>
              <span>
                לוח מודעות, דבר תורה, פרשת השבוע, מסכי עילוי נשמות ורפואת החולים — מתעדכנים מרחוק בלי
                לגעת במסך.
              </span>
            </li>
            <li>
              <strong>פיקוד העורף באולם</strong>
              <span>
                כשיש אזעקה באזור בית הכנסת — התראה ברורה על המסך, כדי שהמתפללים יידעו בזמן אמת.
              </span>
            </li>
          </ul>
        </section>

        <section className="landing-split" id="manage" aria-labelledby="manage-title">
          <div className="landing-split-media" aria-hidden="true">
            <img
              src="/template-bgs/ark-wood.webp"
              alt=""
              className="landing-split-photo"
              width={1200}
              height={800}
              loading="lazy"
            />
          </div>
          <div className="landing-split-copy">
            <p className="landing-kicker">ניהול מרחוק</p>
            <h2 id="manage-title">מערכת ניהול קלה מהטלפון</h2>
            <p>
              עדכנו את מסך בית הכנסת מכל מקום ובכל זמן: הודעות, זמנים, עיצוב ומעבר בין תצוגות —
              בפאנל בעברית שמתוכנן לגבאים. אין צורך במחשב מקומי מסובך; החיבור בענן, והמסך בקיוסק
              ממשיך לרוץ באולם.
            </p>
            <a className="landing-btn primary" href={WHATSAPP} target="_blank" rel="noreferrer">
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
            <a className="landing-btn primary" href={WHATSAPP} target="_blank" rel="noreferrer">
              הזמינו בוואטסאפ
            </a>
            <p className="landing-hardware-note">
              החומרה (טלוויזיה / מחשב מיני) נרכשת בנפרד — נשמח לייעץ מה מתאים לאולם.
            </p>
          </div>
        </section>

        <section className="landing-section landing-contact" id="contact" aria-labelledby="contact-title">
          <div className="landing-section-intro">
            <h2 id="contact-title">השאירו פנייה ונחזור אליכם</h2>
            <p className="landing-section-lead">
              רוצים מסך זמנים לבית הכנסת? דברו בוואטסאפ או חייגו — נחזור בעברית במהירות.
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
      </main>

      <SiteFooter />
    </div>
  );
}
