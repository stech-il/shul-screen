import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { LandingTopbar } from '../components/LandingTopbar';
import { SiteFooter } from '../components/SiteFooter';
import { useI18n } from '../i18n';
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

type LightboxState = { src: string; alt: string; caption: string } | null;

export function Guide() {
  const { t, dir, locale } = useI18n();
  const [lightbox, setLightbox] = useState<LightboxState>(null);
  const titleId = useId();

  useEffect(() => {
    document.title = t('guide.seoTitle');
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('guide.seoDesc'));
  }, [t, locale]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [lightbox]);

  return (
    <div className="guide" dir={dir} lang={locale}>
      <LandingTopbar />

      <main className="guide-main">
        <header className="guide-hero">
          <p className="guide-kicker">{t('guide.kicker')}</p>
          <h1>{t('guide.title')}</h1>
          <p className="guide-lead">{t('guide.lead')}</p>
        </header>

        <ol className="guide-steps">
          {STEPS.map((step, i) => {
            const alt = t(`guide.${step.altKey}`);
            const caption = t(`guide.${step.captionKey}`);
            return (
              <li key={step.titleKey} className="guide-step">
                <div className="guide-step-copy">
                  <span className="guide-step-num" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h2>{t(`guide.${step.titleKey}`)}</h2>
                  <p>{t(`guide.${step.textKey}`)}</p>
                </div>
                <figure className="guide-step-media">
                  <button
                    type="button"
                    className="guide-step-zoom"
                    onClick={() => setLightbox({ src: step.image, alt, caption })}
                    aria-label={t('guide.zoomAria', { caption })}
                  >
                    <img
                      src={step.image}
                      alt={alt}
                      width={1280}
                      height={720}
                      loading={i === 0 ? 'eager' : 'lazy'}
                    />
                    <span className="guide-zoom-hint" aria-hidden="true">
                      {t('guide.zoomHint')}
                    </span>
                  </button>
                  <figcaption>{caption}</figcaption>
                </figure>
              </li>
            );
          })}
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

      {lightbox ? (
        <div
          className="guide-lightbox"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={() => setLightbox(null)}
        >
          <div
            className="guide-lightbox-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="guide-lightbox-bar">
              <p id={titleId} className="guide-lightbox-caption">
                {lightbox.caption}
              </p>
              <button
                type="button"
                className="guide-lightbox-close"
                onClick={() => setLightbox(null)}
              >
                {t('guide.zoomClose')}
              </button>
            </div>
            <img src={lightbox.src} alt={lightbox.alt} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
