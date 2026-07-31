import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LandingTopbar } from '../components/LandingTopbar';
import { SiteFooter } from '../components/SiteFooter';
import { CITIES } from '../data/cities';
import { useI18n } from '../i18n';
import { submitInquiry } from '../lib/inquiries';
import { startTrialSignup, type TrialSignupResult } from '../lib/trialSignup';
import { trackLandingVisit } from '../lib/landingAnalytics';
import { fetchPublicSynagogues, type PublicSynagogue } from '../lib/publicDirectory';
import './Landing.css';

const WHATSAPP = 'https://wa.me/972524521527';
const PHONE_TEL = 'tel:0524521527';
const PHONE_LABEL = '052-4521527';
const MONTHLY = 99;

const FEATURE_KEYS = [
  'feature1',
  'feature2',
  'feature3',
  'feature4',
  'feature5',
  'feature6',
  'feature7',
  'feature8',
  'feature9',
  'feature10',
  'feature11',
  'feature12',
  'feature13',
  'feature14',
] as const;

const CONGREGANT_POINT_KEYS = [
  'congregantPoint1',
  'congregantPoint2',
  'congregantPoint3',
  'congregantPoint4',
  'congregantPoint5',
  'congregantPoint6',
] as const;

type ShowcaseId = 'weekday' | 'holidays' | 'community' | 'oref';

const SHOWCASE_KEYS: {
  id: ShowcaseId;
  titleKey: string;
  textKey: string;
  image: string;
}[] = [
  {
    id: 'weekday',
    titleKey: 'scWeekdayTitle',
    textKey: 'scWeekdayText',
    image: '/template-bgs/jerusalem-stone.webp',
  },
  {
    id: 'holidays',
    titleKey: 'scHolidaysTitle',
    textKey: 'scHolidaysText',
    image: '/template-bgs/gold-sanctuary.webp',
  },
  {
    id: 'community',
    titleKey: 'scCommunityTitle',
    textKey: 'scCommunityText',
    image: '/template-bgs/ark-wood.webp',
  },
  {
    id: 'oref',
    titleKey: 'scOrefTitle',
    textKey: 'scOrefText',
    image: '/template-bgs/shabbat-night.webp',
  },
];

function ShowcaseMock({ id, t }: { id: ShowcaseId; t: (key: string) => string }) {
  if (id === 'weekday') {
    return (
      <div className="landing-mock landing-mock--weekday">
        <div className="landing-mock-top">
          <span>{t('landing.mockShul')}</span>
          <span>{t('landing.mockDate')}</span>
        </div>
        <p className="landing-mock-clock">07:42</p>
        <ul className="landing-mock-rows">
          <li>
            <span>{t('landing.mockAlot')}</span>
            <strong>05:18</strong>
          </li>
          <li>
            <span>{t('landing.mockShacharit')}</span>
            <strong>06:30</strong>
          </li>
          <li>
            <span>{t('landing.mockMincha')}</span>
            <strong>18:55</strong>
          </li>
          <li>
            <span>{t('landing.mockMaariv')}</span>
            <strong>19:25</strong>
          </li>
          <li>
            <span>{t('landing.mockSunset')}</span>
            <strong>19:11</strong>
          </li>
        </ul>
      </div>
    );
  }

  if (id === 'holidays') {
    return (
      <div className="landing-mock landing-mock--holidays">
        <p className="landing-mock-badge">{t('landing.mockHolidayLabel')}</p>
        <p className="landing-mock-clock soft">18:05</p>
        <ul className="landing-mock-rows">
          <li>
            <span>{t('landing.mockCandle')}</span>
            <strong>18:42</strong>
          </li>
          <li>
            <span>{t('landing.mockHolidayIn')}</span>
            <strong>19:01</strong>
          </li>
          <li>
            <span>{t('landing.mockHolidayOut')}</span>
            <strong>20:08</strong>
          </li>
        </ul>
        <p className="landing-mock-foot">{t('landing.mockOmer')}</p>
      </div>
    );
  }

  if (id === 'community') {
    return (
      <div className="landing-mock landing-mock--community">
        <div className="landing-mock-block">
          <p className="landing-mock-label">{t('landing.mockParsha')}</p>
          <p className="landing-mock-value">{t('landing.mockParshaName')}</p>
        </div>
        <div className="landing-mock-block">
          <p className="landing-mock-label">{t('landing.mockAnnounce')}</p>
          <p className="landing-mock-value">{t('landing.mockAnnounceLine')}</p>
        </div>
        <div className="landing-mock-block memorial">
          <p className="landing-mock-label">{t('landing.mockYahrzeit')}</p>
          <p className="landing-mock-value">{t('landing.mockYahrzeitName')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="landing-mock landing-mock--oref">
      <p className="landing-mock-alert-title">{t('landing.mockAlertTitle')}</p>
      <p className="landing-mock-alert-area">{t('landing.mockAlertArea')}</p>
      <p className="landing-mock-alert-action">{t('landing.mockAlertAction')}</p>
    </div>
  );
}

type FormStatus = 'idle' | 'sending' | 'success' | 'error';

export function Landing() {
  const { t, dir, locale } = useI18n();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [synagogueName, setSynagogueName] = useState('');
  const [message, setMessage] = useState('');
  const [formStatus, setFormStatus] = useState<FormStatus>('idle');
  const [formError, setFormError] = useState('');

  const [trialName, setTrialName] = useState('');
  const [trialPhone, setTrialPhone] = useState('');
  const [trialEmail, setTrialEmail] = useState('');
  const [trialShul, setTrialShul] = useState('');
  const [trialCity, setTrialCity] = useState('petah-tikva');
  const [trialNotes, setTrialNotes] = useState('');
  const [trialStatus, setTrialStatus] = useState<FormStatus>('idle');
  const [trialError, setTrialError] = useState('');
  const [trialResult, setTrialResult] = useState<TrialSignupResult | null>(null);
  const [connectedShuls, setConnectedShuls] = useState<PublicSynagogue[]>([]);

  useEffect(() => {
    document.title = t('landing.seoTitle');
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('landing.seoDesc'));
  }, [t, locale]);

  useEffect(() => {
    void trackLandingVisit();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicSynagogues()
      .then((items) => {
        if (!cancelled) setConnectedShuls(items);
      })
      .catch(() => {
        if (!cancelled) setConnectedShuls([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onLeadSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedMessage = message.trim();
    if (trimmedName.length < 2 || trimmedPhone.length < 7 || trimmedMessage.length < 5) {
      setFormStatus('error');
      setFormError(t('landing.formRequired'));
      return;
    }
    setFormStatus('sending');
    try {
      const shulNote = synagogueName.trim();
      const fullMessage = shulNote
        ? `${locale === 'he' ? 'בית כנסת' : 'Synagogue'}: ${shulNote}\n\n${trimmedMessage}`
        : trimmedMessage;
      await submitInquiry({
        name: trimmedName,
        phone: trimmedPhone,
        email: email.trim() || undefined,
        message: fullMessage,
        topic: 'demo',
        source: 'landing',
        synagogueId: '_platform',
      });
      setFormStatus('success');
      setName('');
      setPhone('');
      setEmail('');
      setSynagogueName('');
      setMessage('');
    } catch (err) {
      setFormStatus('error');
      setFormError(err instanceof Error ? err.message : t('landing.formError'));
    }
  }

  async function onTrialSubmit(e: FormEvent) {
    e.preventDefault();
    setTrialError('');
    setTrialResult(null);
    if (
      trialName.trim().length < 2 ||
      trialPhone.replace(/\D/g, '').length < 9 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trialEmail.trim()) ||
      trialShul.trim().length < 2
    ) {
      setTrialStatus('error');
      setTrialError(t('landing.trialRequired'));
      return;
    }
    setTrialStatus('sending');
    try {
      const result = await startTrialSignup({
        contactName: trialName.trim(),
        phone: trialPhone.trim(),
        email: trialEmail.trim(),
        synagogueName: trialShul.trim(),
        cityId: trialCity,
        notes: trialNotes.trim() || undefined,
      });
      setTrialResult(result);
      setTrialStatus('success');
    } catch (err) {
      setTrialStatus('error');
      setTrialError(err instanceof Error ? err.message : t('landing.trialError'));
    }
  }

  return (
    <div className="landing" dir={dir} lang={locale}>
      <LandingTopbar onHomePage />

      <main>
        <section className="landing-hero" id="top" aria-label="hero">
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
            <h1>{t('landing.h1')}</h1>
            <p className="landing-lead">{t('landing.lead')}</p>
            <div className="landing-cta-row">
              <a className="landing-btn primary lg" href="#trial">
                {t('landing.startTrial')}
              </a>
              <a className="landing-btn ghost-light lg" href="#features">
                {t('landing.whatIncludes')}
              </a>
            </div>

            <div className="landing-hero-product" aria-hidden="true">
              <div className="landing-screen">
                <div className="landing-screen-bezel">
                  <div className="landing-screen-glass">
                    <header className="ls-top">
                      <p className="ls-shul">{t('landing.mockShul')}</p>
                      <p className="ls-date">{t('landing.mockDate')}</p>
                    </header>
                    <p className="ls-clock">18:42</p>
                    <ul className="ls-zmanim">
                      <li>
                        <span>{t('landing.mockMincha')}</span>
                        <strong>18:55</strong>
                      </li>
                      <li>
                        <span>{t('landing.mockMaariv')}</span>
                        <strong>19:25</strong>
                      </li>
                      <li>
                        <span>{t('landing.mockSunset')}</span>
                        <strong>19:11</strong>
                      </li>
                    </ul>
                    <p className="ls-note">{t('landing.mockNote')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-about" id="about" aria-labelledby="about-title">
          <div className="landing-about-inner">
            <p className="landing-kicker">{t('landing.aboutKicker')}</p>
            <h2 id="about-title">{t('landing.aboutTitle')}</h2>
            <div className="landing-prose">
              <p>
                <strong>screensmart</strong> {t('landing.aboutP1')}
              </p>
              <p>{t('landing.aboutP2')}</p>
              <p>{t('landing.aboutP3')}</p>
            </div>
          </div>
        </section>

        <section className="landing-features-block" id="features" aria-labelledby="features-title">
          <div className="landing-features-inner">
            <div className="landing-features-head">
              <p className="landing-kicker on-dark">{t('landing.featuresKicker')}</p>
              <h2 id="features-title">{t('landing.featuresTitle')}</h2>
              <p className="landing-section-lead on-dark">{t('landing.featuresLead')}</p>
            </div>
            <ul className="landing-checklist">
              {FEATURE_KEYS.map((key, i) => (
                <li key={key}>
                  <span className="landing-check-num" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{t(`landing.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="landing-congregant" id="congregant" aria-labelledby="congregant-title">
          <div className="landing-congregant-inner">
            <div className="landing-congregant-copy">
              <p className="landing-kicker">{t('landing.congregantKicker')}</p>
              <h2 id="congregant-title">{t('landing.congregantTitle')}</h2>
              <p className="landing-section-lead">{t('landing.congregantLead')}</p>
              <ul className="landing-congregant-points">
                {CONGREGANT_POINT_KEYS.map((key) => (
                  <li key={key}>{t(`landing.${key}`)}</li>
                ))}
              </ul>
              <div className="landing-cta-row">
                <Link className="landing-btn primary lg" to="/times/demo" target="_blank" rel="noreferrer">
                  {t('landing.congregantView')}
                </Link>
                <a className="landing-btn outline lg" href="#trial">
                  {t('landing.congregantCta')}
                </a>
              </div>
            </div>
            <div className="landing-phone-frame landing-congregant-phone" aria-hidden="true">
              <div className="landing-phone-notch" />
              <div className="landing-phone-screen landing-phone-screen--times">
                <div className="landing-times-mock">
                  <p className="landing-times-mock-name">{t('landing.mockShul')}</p>
                  <p className="landing-times-mock-date">{t('landing.mockDate')}</p>
                  <div className="landing-times-mock-card">
                    <h3>{t('landing.mockShacharit')}</h3>
                    <ul>
                      <li>
                        <span>{t('landing.mockShacharit')}</span>
                        <strong>06:30</strong>
                      </li>
                      <li>
                        <span>{t('landing.mockMincha')}</span>
                        <strong>19:00</strong>
                      </li>
                      <li>
                        <span>{t('landing.mockMaariv')}</span>
                        <strong>20:30</strong>
                      </li>
                    </ul>
                  </div>
                  <div className="landing-times-mock-card soft">
                    <h3>{t('landing.mockNote')}</h3>
                    <p>{t('landing.mockAnnounceLine')}</p>
                  </div>
                </div>
              </div>
              <div className="landing-phone-home" />
            </div>
          </div>
        </section>

        {connectedShuls.length > 0 ? (
          <section className="landing-connected" id="connected" aria-labelledby="connected-title">
            <div className="landing-connected-inner">
              <p className="landing-kicker">{t('landing.connectedKicker')}</p>
              <h2 id="connected-title">{t('landing.connectedTitle')}</h2>
              <p className="landing-section-lead">{t('landing.connectedLead')}</p>
              <ul className="landing-connected-grid">
                {connectedShuls.map((shul) => (
                  <li key={shul.id}>
                    <Link
                      className="landing-connected-card"
                      to={`/times/${encodeURIComponent(shul.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      title={shul.name}
                    >
                      <span className="landing-connected-logo">
                        {shul.logoUrl ? (
                          <img src={shul.logoUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="landing-connected-fallback" aria-hidden="true">
                            {shul.name.slice(0, 1)}
                          </span>
                        )}
                      </span>
                      <span className="landing-connected-name">{shul.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <section className="landing-showcases" id="screens" aria-labelledby="screens-title">
          <div className="landing-showcases-head">
            <p className="landing-kicker">{t('landing.screensKicker')}</p>
            <h2 id="screens-title">{t('landing.screensTitle')}</h2>
            <p className="landing-section-lead">{t('landing.screensLead')}</p>
          </div>
          {SHOWCASE_KEYS.map((item, index) => (
            <article
              key={item.id}
              className={`landing-showcase ${index % 2 === 1 ? 'flip' : ''}`}
              aria-labelledby={`${item.id}-title`}
            >
              <div className="landing-showcase-media" aria-hidden="true">
                <img src={item.image} alt="" width={1200} height={800} loading="lazy" />
                <div className="landing-showcase-shade" />
                <div className="landing-showcase-stage">
                  <ShowcaseMock id={item.id} t={t} />
                </div>
              </div>
              <div className="landing-showcase-copy">
                <h3 id={`${item.id}-title`}>{t(`landing.${item.titleKey}`)}</h3>
                <p>{t(`landing.${item.textKey}`)}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="landing-preview" id="preview" aria-labelledby="preview-title">
          <div className="landing-preview-inner">
            <div className="landing-preview-copy">
              <p className="landing-kicker">{t('landing.previewKicker')}</p>
              <h2 id="preview-title">{t('landing.previewTitle')}</h2>
              <p className="landing-section-lead">{t('landing.previewLead')}</p>
            </div>
            <div className="landing-phone-frame" aria-hidden="true">
              <div className="landing-phone-notch" />
              <div className="landing-phone-screen">
                <ShowcaseMock id="weekday" t={t} />
              </div>
              <div className="landing-phone-home" />
            </div>
          </div>
        </section>

        <section className="landing-manage" id="manage" aria-labelledby="manage-title">
          <div className="landing-manage-inner">
            <p className="landing-kicker on-dark">{t('landing.manageKicker')}</p>
            <h2 id="manage-title">{t('landing.manageTitle')}</h2>
            <p>{t('landing.manageText')}</p>
            <a className="landing-btn primary lg" href={WHATSAPP} target="_blank" rel="noreferrer">
              {t('landing.askInstall')}
            </a>
          </div>
        </section>

        <section className="landing-pricing" id="pricing" aria-labelledby="pricing-title">
          <div className="landing-pricing-inner">
            <p className="landing-kicker">{t('landing.pricingKicker')}</p>
            <h2 id="pricing-title">{t('landing.pricingTitle')}</h2>
            <p className="landing-section-lead">{t('landing.pricingLead')}</p>
            <p className="landing-price">
              <strong>{MONTHLY}</strong>
              <span>{t('landing.perMonth')}</span>
            </p>
            <p className="landing-price-note">{t('landing.priceNote')}</p>
            <p className="landing-hardware-note" role="note">
              <strong>{t('landing.hardwareNoteStrong')}</strong>
              {t('landing.hardwareNoteRest')}
            </p>
            <ul className="landing-price-includes">
              <li>{t('landing.priceInc1')}</li>
              <li>{t('landing.priceInc2')}</li>
              <li>{t('landing.priceInc3')}</li>
              <li>{t('landing.priceInc4')}</li>
            </ul>
            <a className="landing-btn primary lg" href="#trial">
              {t('landing.startTrial')}
            </a>
          </div>
        </section>

        <section className="landing-trial" id="trial" aria-labelledby="trial-title">
          <div className="landing-trial-inner">
            <p className="landing-kicker">{t('landing.trialKicker')}</p>
            <h2 id="trial-title">{t('landing.trialTitle')}</h2>
            <p className="landing-section-lead">{t('landing.trialLead')}</p>

            {trialStatus === 'success' && trialResult ? (
              <div className="landing-trial-success" role="status">
                <h3>{t('landing.trialSuccessTitle')}</h3>
                <p className={trialResult.mailOk ? 'ok' : 'warn'}>
                  {trialResult.mailOk
                    ? t('landing.trialSuccessMail')
                    : t('landing.trialSuccessMailFail')}
                </p>
                <dl className="landing-trial-creds">
                  <div>
                    <dt>{t('landing.trialScreenId')}</dt>
                    <dd dir="ltr">{trialResult.synagogueId}</dd>
                  </div>
                  <div>
                    <dt>{t('landing.trialUsername')}</dt>
                    <dd dir="ltr">{trialResult.username}</dd>
                  </div>
                  <div>
                    <dt>{t('landing.trialPassword')}</dt>
                    <dd dir="ltr">{trialResult.password}</dd>
                  </div>
                </dl>
                <div className="landing-cta-row">
                  <Link
                    className="landing-btn primary lg"
                    to={`/login/${encodeURIComponent(trialResult.synagogueId)}`}
                  >
                    {t('landing.trialOpenAdmin')}
                  </Link>
                  <Link
                    className="landing-btn outline lg"
                    to={`/display/${encodeURIComponent(trialResult.synagogueId)}`}
                  >
                    {t('landing.trialOpenDisplay')}
                  </Link>
                  <Link
                    className="landing-btn outline lg"
                    to={`/times/${encodeURIComponent(trialResult.synagogueId)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('landing.trialOpenTimes')}
                  </Link>
                  <Link
                    className="landing-btn ghost-light lg"
                    to={`/login/${encodeURIComponent(trialResult.synagogueId)}?billing=1`}
                  >
                    {t('landing.trialOpenBilling')}
                  </Link>
                </div>
              </div>
            ) : (
              <form className="landing-lead-form landing-trial-form" onSubmit={(e) => void onTrialSubmit(e)} noValidate>
                <label>
                  <span>{t('landing.trialName')}</span>
                  <input
                    name="trialName"
                    autoComplete="name"
                    required
                    minLength={2}
                    value={trialName}
                    onChange={(e) => setTrialName(e.target.value)}
                    disabled={trialStatus === 'sending'}
                  />
                </label>
                <label>
                  <span>{t('landing.trialPhone')}</span>
                  <input
                    name="trialPhone"
                    type="tel"
                    autoComplete="tel"
                    dir="ltr"
                    required
                    minLength={9}
                    value={trialPhone}
                    onChange={(e) => setTrialPhone(e.target.value)}
                    disabled={trialStatus === 'sending'}
                  />
                </label>
                <label>
                  <span>{t('landing.trialEmail')}</span>
                  <input
                    name="trialEmail"
                    type="email"
                    autoComplete="email"
                    dir="ltr"
                    required
                    value={trialEmail}
                    onChange={(e) => setTrialEmail(e.target.value)}
                    disabled={trialStatus === 'sending'}
                  />
                </label>
                <label>
                  <span>{t('landing.trialShul')}</span>
                  <input
                    name="trialShul"
                    autoComplete="organization"
                    required
                    minLength={2}
                    value={trialShul}
                    onChange={(e) => setTrialShul(e.target.value)}
                    disabled={trialStatus === 'sending'}
                  />
                </label>
                <label className="landing-trial-city">
                  <span>{t('landing.trialCity')}</span>
                  <select
                    name="trialCity"
                    value={trialCity}
                    onChange={(e) => setTrialCity(e.target.value)}
                    disabled={trialStatus === 'sending'}
                    required
                  >
                    {CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="landing-trial-notes">
                  <span>{t('landing.trialNotes')}</span>
                  <textarea
                    name="trialNotes"
                    rows={3}
                    value={trialNotes}
                    onChange={(e) => setTrialNotes(e.target.value)}
                    disabled={trialStatus === 'sending'}
                  />
                </label>
                <div className="landing-lead-actions">
                  <button className="landing-btn primary lg" type="submit" disabled={trialStatus === 'sending'}>
                    {trialStatus === 'sending' ? t('landing.trialSending') : t('landing.trialSubmit')}
                  </button>
                </div>
                {trialStatus === 'error' ? (
                  <p className="landing-form-msg err" role="alert">
                    {trialError || t('landing.trialError')}
                  </p>
                ) : null}
              </form>
            )}
          </div>
        </section>

        <section className="landing-contact" id="contact" aria-labelledby="contact-title">
          <h2 id="contact-title">{t('landing.contactTitle')}</h2>
          <p>{t('landing.contactLead')}</p>

          <form className="landing-lead-form" onSubmit={(e) => void onLeadSubmit(e)} noValidate>
            <label>
              <span>{t('landing.formName')}</span>
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={formStatus === 'sending'}
              />
            </label>
            <label>
              <span>{t('landing.formPhone')}</span>
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                dir="ltr"
                required
                minLength={7}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={formStatus === 'sending'}
              />
            </label>
            <label>
              <span>{t('landing.formEmail')}</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={formStatus === 'sending'}
              />
            </label>
            <label>
              <span>{t('landing.formShul')}</span>
              <input
                name="synagogue"
                autoComplete="organization"
                value={synagogueName}
                onChange={(e) => setSynagogueName(e.target.value)}
                disabled={formStatus === 'sending'}
              />
            </label>
            <label className="landing-lead-full">
              <span>{t('landing.formMessage')}</span>
              <textarea
                name="message"
                required
                minLength={5}
                rows={4}
                placeholder={t('landing.formMessagePlaceholder')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={formStatus === 'sending'}
              />
            </label>
            <div className="landing-lead-actions">
              <button className="landing-btn primary lg" type="submit" disabled={formStatus === 'sending'}>
                {formStatus === 'sending' ? t('landing.formSending') : t('landing.formSubmit')}
              </button>
            </div>
            {formStatus === 'success' ? (
              <p className="landing-form-msg ok" role="status">
                {t('landing.formSuccess')}
              </p>
            ) : null}
            {formStatus === 'error' ? (
              <p className="landing-form-msg err" role="alert">
                {formError || t('landing.formError')}
              </p>
            ) : null}
          </form>

          <p className="landing-secondary-label">{t('landing.secondaryCtas')}</p>
          <div className="landing-cta-row">
            <a className="landing-btn primary lg" href={WHATSAPP} target="_blank" rel="noreferrer">
              {t('landing.whatsapp')}
            </a>
            <a className="landing-btn outline lg" href={PHONE_TEL} dir="ltr">
              {PHONE_LABEL}
            </a>
          </div>
          <p className="landing-admin-link">
            <Link to="/guide">{t('landing.guideLink')}</Link>
            <span aria-hidden="true"> · </span>
            <Link to="/admin">{t('landing.adminLogin')}</Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
