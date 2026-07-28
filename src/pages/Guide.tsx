import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { SiteFooter } from '../components/SiteFooter';
import { LangSwitch, useI18n } from '../i18n';
import './Guide.css';

const STEPS = [
  {
    titleKey: 'step1Title',
    textKey: 'step1Text',
    image: '/guide/step-1-shul-id.webp',
    altKey: 'imgAlt1',
    captionKey: 'imgCap1',
  },
  {
    titleKey: 'step2Title',
    textKey: 'step2Text',
    image: '/guide/step-2-kiosk-install.webp',
    altKey: 'imgAlt2',
    captionKey: 'imgCap2',
  },
  {
    titleKey: 'step3Title',
    textKey: 'step3Text',
    image: '/guide/step-3-hdmi-tv.webp',
    altKey: 'imgAlt3',
    captionKey: 'imgCap3',
  },
  {
    titleKey: 'step4Title',
    textKey: 'step4Text',
    image: '/guide/step-4-first-run.webp',
    altKey: 'imgAlt4',
    captionKey: 'imgCap4',
  },
  {
    titleKey: 'step5Title',
    textKey: 'step5Text',
    image: '/guide/step-5-publish.webp',
    altKey: 'imgAlt5',
    captionKey: 'imgCap5',
  },
] as const;

export function Guide() {
  const { t, dir, locale } = useI18n();

  useEffect(() => {
    document.title = t('guide.seoTitle');
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('guide.seoDesc'));
  }, [t, locale]);

  return (
    <div className="guide" dir={dir} lang={locale}>
      <header className="guide-topbar">
        <Link className="guide-topbar-brand" to="/" aria-label={t('guide.brandAria')}>
          <BrandLogo size="sm" withWordmark />
        </Link>
        <div className="guide-topbar-actions">
          <LangSwitch variant="dark" />
          <Link className="guide-back" to="/">
            {t('guide.backHome')}
          </Link>
        </div>
      </header>

      <main className="guide-main">
        <header className="guide-hero">
          <p className="guide-kicker">{t('guide.kicker')}</p>
          <h1>{t('guide.title')}</h1>
          <p className="guide-lead">{t('guide.lead')}</p>
        </header>

        <ol className="guide-steps">
          {STEPS.map((step, i) => (
            <li key={step.titleKey} className="guide-step">
              <div className="guide-step-copy">
                <span className="guide-step-num" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h2>{t(`guide.${step.titleKey}`)}</h2>
                <p>{t(`guide.${step.textKey}`)}</p>
              </div>
              <figure className="guide-step-media">
                <img
                  src={step.image}
                  alt={t(`guide.${step.altKey}`)}
                  width={1280}
                  height={720}
                  loading={i === 0 ? 'eager' : 'lazy'}
                />
                <figcaption>{t(`guide.${step.captionKey}`)}</figcaption>
              </figure>
            </li>
          ))}
        </ol>

        <aside className="guide-tips" aria-labelledby="guide-tips-title">
          <h2 id="guide-tips-title">{t('guide.tipTitle')}</h2>
          <ul>
            <li>{t('guide.tip1')}</li>
            <li>{t('guide.tip2')}</li>
            <li>{t('guide.tip3')}</li>
          </ul>
          <Link className="guide-cta" to="/#contact">
            {t('guide.ctaContact')}
          </Link>
        </aside>
      </main>

      <SiteFooter />
    </div>
  );
}
