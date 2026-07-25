import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CanvasStage } from '../components/canvas/CanvasStage';
import type { CanvasData } from '../components/canvas/CanvasWidgetContent';
import { defaultCanvas } from '../components/canvas/widgets';
import { getOrefMatchNames } from '../data/cities';
import { designToCssVars } from '../data/designPresets';
import { createDefaultConfig } from '../data/defaults';
import { getDayInfo } from '../lib/jewish';
import {
  fetchHebcalZmanim,
  pickEnabledZmanim,
  resolveFromZmanimMap,
  type HebcalZmanimResult,
} from '../lib/hebcalZmanim';
import { disableKiosk, enableKiosk, isFullscreen, watchWakeLock } from '../lib/kiosk';
import { verifyPin } from '../lib/auth';
import { getModeInfo } from '../lib/modes';
import {
  categoryLabel,
  subscribeOrefAlerts,
  type MatchedOrefAlert,
} from '../lib/orefAlerts';
import { startHeartbeat, trackEvent } from '../lib/analytics';
import { playOrefTone } from '../lib/sound';
import { daysLeft, getScreenLicenseStatus } from '../lib/license';
import {
  isAnnouncementActive,
  startAutoSync,
  syncConfig,
} from '../lib/storage';
import { subscribeLiveUpdates } from '../lib/liveSync';
import { subscribeWeather, type WeatherData } from '../lib/weather';
import type { ComputedZman, DayInfo, ModeInfo, SynagogueConfig, ZmanKey } from '../types';
import './Display.css';

interface Props {
  synagogueId: string;
}

export function Display({ synagogueId }: Props) {
  const [params] = useSearchParams();
  const autoKiosk = params.get('kiosk') === '1';
  const rootRef = useRef<HTMLDivElement>(null);

  const [config, setConfig] = useState<SynagogueConfig | null>(null);
  const [zmanim, setZmanim] = useState<ComputedZman[]>([]);
  const [zmanimMap, setZmanimMap] = useState<HebcalZmanimResult['times']>({});
  const [day, setDay] = useState<DayInfo>(getDayInfo());
  const [modeInfo, setModeInfo] = useState<ModeInfo | null>(null);
  const [clock, setClock] = useState('');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [kioskOn, setKioskOn] = useState(false);
  const [kioskMsg, setKioskMsg] = useState('');
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [exitPin, setExitPin] = useState('');
  const [showExit, setShowExit] = useState(false);
  const [orefMatch, setOrefMatch] = useState<MatchedOrefAlert | null>(null);

  useEffect(() => {
    let cancelled = false;
    const stopSync = startAutoSync();

    async function load() {
      try {
        const fallback = await createDefaultConfig(synagogueId, 'בית כנסת');
        const result = await syncConfig(synagogueId, fallback);
        if (cancelled) return;
        setConfig(result.bundle.config);
      } catch {
        /* ignore */
      }
    }

    load();
    const stopLive = subscribeLiveUpdates(synagogueId, (next) => {
      if (cancelled) return;
      setConfig(next);
    });

    const onOnline = () => load();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      stopSync();
      stopLive();
      window.removeEventListener('online', onOnline);
    };
  }, [synagogueId]);

  useEffect(() => {
    if (!config?.showWeather) {
      setWeather(null);
      return;
    }
    return subscribeWeather(config.cityId, setWeather, 5 * 60_000);
  }, [config?.cityId, config?.showWeather]);

  useEffect(() => {
    if (!config?.showOrefAlerts) {
      setOrefMatch(null);
      return;
    }
    const names = getOrefMatchNames(config.cityId, config.orefAreaExtra);
    return subscribeOrefAlerts(names, (match) => {
      setOrefMatch(match);
      if (match && config.modes.orefSound) {
        const onShabbat = new Date().getDay() === 6;
        if (!(config.modes.muteOrefOnShabbat && onShabbat)) {
          playOrefTone();
        }
      }
      if (match) trackEvent(config.id, 'oref_alert', match.matchedAreas.join(','));
    }, 3000);
  }, [config?.cityId, config?.showOrefAlerts, config?.orefAreaExtra, config?.modes.orefSound, config?.modes.muteOrefOnShabbat, config?.id]);

  useEffect(() => {
    if (!config) return;
    trackEvent(config.id, 'display_open', config.layout);
    return startHeartbeat(config.id, () => config.layout);
  }, [config?.id, config?.layout]);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    async function loadZmanim() {
      const result = await fetchHebcalZmanim(config!.cityId);
      if (cancelled) return;
      setZmanimMap(result.times);
      setZmanim(pickEnabledZmanim(result, config!.enabledZmanim as ZmanKey[]));
    }
    loadZmanim();
    const interval = setInterval(loadZmanim, 15 * 60_000);
    window.addEventListener('online', loadZmanim);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('online', loadZmanim);
    };
  }, [config?.cityId, config?.enabledZmanim]);

  useEffect(() => {
    function tick() {
      const now = new Date();
      setClock(
        now.toLocaleTimeString('he-IL', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
      );
      setDay(getDayInfo(now, config?.yahrzeits ?? []));
      if (config) setModeInfo(getModeInfo(config.cityId, config.modes, now));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [config?.cityId, config?.modes, config?.yahrzeits]);

  const activeAnnouncements = useMemo(() => {
    if (!config) return [];
    return config.announcements.filter((a) => isAnnouncementActive(a));
  }, [config, day.hebrewDate]);

  useEffect(() => {
    if (activeAnnouncements.length <= 1) return;
    const sec = Math.max(3, config?.modes.carouselSeconds ?? 8);
    const t = setInterval(() => {
      setCarouselIdx((i) => (i + 1) % activeAnnouncements.length);
    }, sec * 1000);
    return () => clearInterval(t);
  }, [activeAnnouncements.length, config?.modes.carouselSeconds]);

  useEffect(() => {
    const stopWake = watchWakeLock();
    async function maybeKiosk() {
      if (autoKiosk || window.shulKiosk?.isElectron) {
        const r = await enableKiosk(rootRef.current ?? undefined);
        setKioskOn(r.fullscreen || r.wake);
      }
    }
    maybeKiosk();
    const onFs = () => setKioskOn(isFullscreen());
    document.addEventListener('fullscreenchange', onFs);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (kioskOn || autoKiosk || window.shulKiosk?.isElectron)) {
        e.preventDefault();
        setShowExit(true);
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      stopWake();
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('keydown', onKey);
    };
  }, [autoKiosk, kioskOn]);

  if (!config) {
    return (
      <div className="display" dir="rtl">
        טוען מסך...
      </div>
    );
  }

  const licenseStatus = getScreenLicenseStatus(config);
  if (!licenseStatus.ok) {
    const left = daysLeft(licenseStatus.license);
    return (
      <div className="display license-lock" dir="rtl" lang="he">
        <div className="license-lock-card">
          <p className="license-lock-eyebrow">רישיון מסך</p>
          <h1>{config.name}</h1>
          <p className="license-lock-reason">{licenseStatus.reason}</p>
          {licenseStatus.license ? (
            <p className="license-lock-meta" dir="ltr">
              {licenseStatus.license.key}
              {left != null ? ` · נותרו ${left} ימים` : ''}
            </p>
          ) : null}
          <p className="license-lock-help">
            הפעל מפתח רישיון במסך הניהול, או הנפק רישיון חדש מדשבורד הסוכנות / מנהל המערכת.
          </p>
          <div className="license-lock-actions">
            <Link className="btn primary" to={`/login/${config.id}`}>
              כניסה לניהול
            </Link>
            <Link className="btn ghost" to="/agency">
              דשבורד סוכנות
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const d = config.design;
  const layout = config.layout ?? 'classic';
  const media = config.media ?? { gallery: [] };
  const logoSrc = media.logoDataUrl || d.logoUrl || config.branding?.logoUrl;
  const bgSrc = media.backgroundDataUrl || d.backgroundImageUrl;
  const style: Record<string, string> = { ...designToCssVars(d) };
  if (bgSrc) style['--bg-image'] = `url(${bgSrc})`;

  const special = config.modes.specialMode ?? 'normal';
  const effectiveLayout =
    special === 'event' ? 'event' : special === 'mourning' ? 'mourning' : layout;

  const modeClass = modeInfo ? `mode-${modeInfo.mode}` : '';
  const className = [
    'display',
    `theme-${config.theme}`,
    `layout-${effectiveLayout}`,
    `panel-${d.panelStyle}`,
    `header-${d.headerStyle}`,
    `clock-${d.clockStyle}`,
    `motion-${d.motion}`,
    modeClass,
    special !== 'normal' ? `special-${special}` : '',
    bgSrc ? 'has-bg-image' : '',
    d.highContrast ? 'high-contrast' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const showSide =
    effectiveLayout === 'classic' ||
    effectiveLayout === 'split' ||
    effectiveLayout === 'elegant' ||
    effectiveLayout === 'board' ||
    effectiveLayout === 'dual';
  const centeredHeader = d.headerStyle === 'centered';
  const carouselItem = activeAnnouncements[carouselIdx % Math.max(activeAnnouncements.length, 1)];
  const isCanvas = effectiveLayout === 'canvas';

  const canvasData: CanvasData = {
    name: config.name,
    dedication: config.dedication,
    logoSrc,
    clock,
    day,
    zmanim,
    blocks: config.blocks.filter((b) => b.enabled),
    resolveTime: (item) =>
      resolveFromZmanimMap(zmanimMap, item.time, item.fromZman, item.offsetMinutes ?? 0),
    announcement: carouselItem ?? null,
    announcementCount: activeAnnouncements.length,
    announcementIndex: activeAnnouncements.length
      ? carouselIdx % activeAnnouncements.length
      : 0,
    weatherTemp: config.showWeather ? weather?.tempC ?? null : null,
    countdownLabel: modeInfo?.countdownLabel,
  };

  async function confirmExit() {
    if (!config) return;
    if (config.kioskExitPinHash) {
      const ok = await verifyPin(exitPin, config.kioskExitPinHash);
      if (!ok) {
        setKioskMsg('PIN יציאה שגוי');
        return;
      }
    } else if (exitPin && exitPin !== '1234') {
      setKioskMsg('PIN יציאה שגוי (ברירת מחדל 1234)');
      return;
    }
    await disableKiosk();
    setKioskOn(false);
    setShowExit(false);
    setExitPin('');
    setKioskMsg('');
    if (window.shulKiosk?.requestExit) window.shulKiosk.requestExit();
  }

  const sideContent = (
    <aside className="panel side-panel">
      {config.showParasha && day.parasha ? (
        <div className="side-block">
          <h3>פרשת השבוע</h3>
          <p className="big">{day.parasha}</p>
        </div>
      ) : null}
      {config.showDafYomi && day.dafYomi ? (
        <div className="side-block">
          <h3>הדף היומי</h3>
          <p className="big">{day.dafYomi}</p>
        </div>
      ) : null}
      {config.showWeather && weather ? (
        <div className="side-block">
          <h3>מזג האוויר</h3>
          <p className="big">{weather.tempC}°C</p>
        </div>
      ) : null}
      {config.showCalendarExtras && day.holidays?.length ? (
        <div className="side-block">
          <h3>לוח שנה</h3>
          <p className="big">{day.holidays.join(' · ')}</p>
        </div>
      ) : null}
      {config.showCalendarExtras && day.memorials?.length ? (
        <div className="side-block">
          <h3>ימי זיכרון</h3>
          <p className="big">{day.memorials.join(' · ')}</p>
        </div>
      ) : null}
      {config.showYahrzeit && day.yahrzeitNames?.length ? (
        <div className="side-block">
          <h3>יארצייט</h3>
          <p className="big">{day.yahrzeitNames.join(' · ')}</p>
        </div>
      ) : null}
    </aside>
  );

  return (
    <div ref={rootRef} className={className} dir="rtl" lang="he" style={style}>
      {config.emergency.active && config.emergency.message ? (
        <div className="emergency-overlay" role="alert">
          <p className="emergency-label">הודעת חירום</p>
          <p className="emergency-text">{config.emergency.message}</p>
        </div>
      ) : null}

      {orefMatch ? (
        <div className="oref-overlay" role="alert">
          <p className="oref-label">פיקוד העורף</p>
          <p className="oref-title">
            {categoryLabel(orefMatch.alert.cat, orefMatch.alert.title)}
          </p>
          <p className="oref-areas">{orefMatch.matchedAreas.join(' · ')}</p>
          {orefMatch.alert.desc ? (
            <p className="oref-desc">{orefMatch.alert.desc}</p>
          ) : null}
        </div>
      ) : null}

      {modeInfo && modeInfo.mode !== 'weekday' ? (
        <div className={`mode-banner mode-${modeInfo.mode}`}>
          <strong>{modeInfo.label}</strong>
          {modeInfo.countdownLabel ? <span>{modeInfo.countdownLabel}</span> : null}
        </div>
      ) : modeInfo?.countdownLabel ? (
        <div className="mode-banner mode-erev-shabbat">
          <strong>הדלקת נרות</strong>
          <span className="time-ltr">{modeInfo.countdownLabel}</span>
        </div>
      ) : null}

      {special === 'event' ? (
        <div className="event-banner">
          <p className="event-label">אירוע מיוחד</p>
          <h2>{config.modes.eventTitle || 'אירוע'}</h2>
          {config.modes.eventSubtitle ? <p>{config.modes.eventSubtitle}</p> : null}
          {media.eventImageUrl ? (
            <img className="event-image" src={media.eventImageUrl} alt="" />
          ) : null}
        </div>
      ) : null}

      {special === 'mourning' ? (
        <div className="mourning-banner">
          <p>לע״נ</p>
          <h2>{config.modes.mourningName || 'נשמת המנוח/ה'}</h2>
        </div>
      ) : null}

      {media.loopVideoUrl && special === 'event' ? (
        <video className="loop-video" src={media.loopVideoUrl} autoPlay muted loop playsInline />
      ) : null}

      {isCanvas ? (
        <div className="canvas-viewport">
          <CanvasStage canvas={config.canvas ?? defaultCanvas()} data={canvasData} />
        </div>
      ) : null}

      {isCanvas ? null : (
      <header className="display-header">
        <div className="brand">
          {logoSrc ? <img className="brand-logo" src={logoSrc} alt={config.name} /> : null}
          <h1>{config.name}</h1>
          {d.showOrnaments ? <div className={`ornament ${centeredHeader ? 'center' : ''}`} /> : null}
          {config.dedication ? <p className="dedication">{config.dedication}</p> : null}
        </div>
        <div className="header-meta">
          {config.showClock ? <div className="clock time-ltr">{clock}</div> : null}
          {config.showHebrewDate ? (
            <div className="date-line">
              יום {day.weekday} · {day.hebrewDate}
            </div>
          ) : null}
        </div>
      </header>
      )}

      {isCanvas ? null : (
      <main className={`display-grid layout-${effectiveLayout}`}>
        {effectiveLayout !== 'minimal' && effectiveLayout !== 'event' ? (
          <section className="panel zmanim-panel">
            <h2>זמני היום</h2>
            <ul className="zmanim-list">
              {zmanim.map((z) => (
                <li key={z.key}>
                  <span>{z.label}</span>
                  <strong className="time-ltr">{z.formatted}</strong>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="panels-stack">
          {effectiveLayout === 'minimal' ? (
            <div className="panel zmanim-panel">
              <h2>זמני היום</h2>
              <ul className="zmanim-list compact">
                {zmanim.map((z) => (
                  <li key={z.key}>
                    <span>{z.label}</span>
                    <strong className="time-ltr">{z.formatted}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {effectiveLayout !== 'event' &&
            config.blocks
            .filter((b) => b.enabled)
            .filter((b) => {
              if (!modeInfo || modeInfo.mode === 'weekday' || modeInfo.mode === 'erev-shabbat') {
                return true;
              }
              if (modeInfo.mode === 'shabbat') {
                const t = b.title;
                if (/חול/.test(t) && /שבת/.test(t) === false) return false;
              }
              return true;
            })
            .map((block) => (
              <div className="panel" key={block.id}>
                <h2>{block.title}</h2>
                <ul className="schedule-list">
                  {block.items.map((item) => {
                    const timeStr = item.noTime
                      ? ''
                      : resolveFromZmanimMap(
                          zmanimMap,
                          item.time,
                          item.fromZman,
                          item.offsetMinutes ?? 0,
                        );
                    if (item.noTime || !timeStr) {
                      return (
                        <li key={item.id} className="schedule-heading">
                          <span className="item-title">
                            {item.title}
                            {item.note ? <em>{item.note}</em> : null}
                          </span>
                        </li>
                      );
                    }
                    return (
                      <li key={item.id}>
                        <span className="item-title">
                          {item.title}
                          {item.note ? <em>{item.note}</em> : null}
                        </span>
                        <strong className="time-ltr">{timeStr}</strong>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

          {activeAnnouncements.length > 0 && carouselItem ? (
            <div className="panel announce-panel carousel">
              <h2>הודעות</h2>
              <p key={carouselItem.id} className="carousel-item">
                {carouselItem.text}
              </p>
              {activeAnnouncements.length > 1 ? (
                <div className="carousel-dots">
                  {activeAnnouncements.map((a, i) => (
                    <span key={a.id} className={i === carouselIdx % activeAnnouncements.length ? 'on' : ''} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {showSide ? sideContent : null}
      </main>
      )}

      {showExit ? (
        <div className="exit-modal">
          <div className="exit-card">
            <h3>יציאה מקיוסק</h3>
            <p>הזן PIN יציאה</p>
            <input
              type="password"
              value={exitPin}
              onChange={(e) => {
                setExitPin(e.target.value);
                setKioskMsg('');
              }}
              autoFocus
            />
            {kioskMsg ? <p className="error">{kioskMsg}</p> : null}
            <div className="exit-actions">
              <button type="button" className="btn ghost" onClick={() => setShowExit(false)}>
                ביטול
              </button>
              <button type="button" className="btn primary" onClick={confirmExit}>
                יציאה
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
