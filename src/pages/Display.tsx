import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { NotFoundScreen } from '../components/NotFoundScreen';
import { CandleTimesBoard } from '../components/CandleTimesBoard';
import { CanvasStage } from '../components/canvas/CanvasStage';
import type { CanvasData } from '../components/canvas/CanvasWidgetContent';
import { defaultCanvas } from '../components/canvas/widgets';
import { getOrefMatchNames } from '../data/cities';
import { designToCssVars } from '../data/designPresets';
import { ensureCustomFontsLoaded } from '../lib/customFonts';
import { getDayInfo } from '../lib/jewish';
import {
  fetchHebcalZmanim,
  getShabbatZmanimDate,
  isShabbatScheduleBlock,
  pickEnabledZmanim,
  resolveFromZmanimMap,
  type HebcalZmanimResult,
} from '../lib/hebcalZmanim';
import { disableKiosk, enableKiosk, isFullscreen, watchWakeLock } from '../lib/kiosk';
import { isAndroidKiosk } from '../lib/androidKiosk';
import { verifyPin } from '../lib/auth';
import { getModeInfo } from '../lib/modes';
import {
  categoryLabel,
  fetchOrefDrill,
  subscribeOrefAlerts,
  type MatchedOrefAlert,
} from '../lib/orefAlerts';
import { startHeartbeat, trackEvent } from '../lib/analytics';
import { playOrefTone } from '../lib/sound';
import { getScreenLicenseStatus } from '../lib/license';
import { toPlainDisplayText } from '../lib/sanitizeHtml';
import {
  isAnnouncementActive,
  startAutoSync,
  syncConfig,
} from '../lib/storage';
import { subscribeLiveUpdates } from '../lib/liveSync';
import { subscribeWeather, weatherCodeToIcon, type WeatherData } from '../lib/weather';
import type { ComputedZman, DayInfo, ModeInfo, SynagogueConfig, ZmanKey } from '../types';
import './Display.css';

interface Props {
  synagogueId: string;
}

export function Display({ synagogueId }: Props) {
  const [params] = useSearchParams();
  const autoKiosk = params.get('kiosk') === '1';
  const isAndroidNative = isAndroidKiosk();
  const rootRef = useRef<HTMLDivElement>(null);

  const [config, setConfig] = useState<SynagogueConfig | null>(null);
  const [zmanim, setZmanim] = useState<ComputedZman[]>([]);
  const [zmanimMap, setZmanimMap] = useState<HebcalZmanimResult['times']>({});
  const [shabbatZmanimMap, setShabbatZmanimMap] =
    useState<HebcalZmanimResult['times']>({});
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
  const [orefDrill, setOrefDrill] = useState<MatchedOrefAlert | null>(null);
  /** After first entrance animations finish — prevents re-blink on config/weather updates */
  const [settled, setSettled] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const stopSync = startAutoSync();
    let live: ReturnType<typeof subscribeLiveUpdates> | null = null;

    async function load() {
      try {
        const result = await syncConfig(synagogueId, undefined, { preferCloud: true });
        if (cancelled) return;
        if (result.source === 'default') {
          setConfig(null);
          setMissing(true);
          return;
        }
        setMissing(false);
        setConfig(result.bundle.config);
        live?.noteBaseline(result.bundle.config);
      } catch {
        if (!cancelled) {
          setConfig(null);
          setMissing(true);
        }
      }
    }

    live = subscribeLiveUpdates(synagogueId, (next) => {
      if (cancelled) return;
      setConfig((prev) => {
        if (
          prev &&
          (prev.revision ?? 0) === (next.revision ?? 0) &&
          (prev.updatedAt || '') === (next.updatedAt || '')
        ) {
          return prev;
        }
        return next;
      });
    });

    void load();
    const onOnline = () => void load();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      stopSync();
      live?.stop();
      window.removeEventListener('online', onOnline);
    };
  }, [synagogueId]);

  useEffect(() => {
    setSettled(false);
    if (!config) return;
    const t = window.setTimeout(() => setSettled(true), 900);
    return () => window.clearTimeout(t);
  }, [synagogueId, Boolean(config)]);

  useEffect(() => {
    ensureCustomFontsLoaded(config?.media?.customFonts);
  }, [config?.media?.customFonts]);

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

  // Platform-admin Homefront drill — overlays this screen for testing
  useEffect(() => {
    if (!config?.id) return;
    let stopped = false;
    let playedForId = '';
    async function tick() {
      const drill = await fetchOrefDrill(config!.id);
      if (stopped) return;
      if (drill) {
        setOrefDrill({
          alert: drill.alert,
          matchedAreas: drill.alert.data,
          fetchedAt: new Date().toISOString(),
        });
        if (playedForId !== drill.alert.id && config!.modes.orefSound) {
          playedForId = drill.alert.id;
          const onShabbat = new Date().getDay() === 6;
          if (!(config!.modes.muteOrefOnShabbat && onShabbat)) {
            playOrefTone();
          }
        }
      } else {
        setOrefDrill(null);
        playedForId = '';
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 2000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [config?.id, config?.modes.orefSound, config?.modes.muteOrefOnShabbat]);

  // Heartbeat as soon as the route id is known (don't wait for cloud config),
  // so Agency can see "online" even while the screen is still loading.
  useEffect(() => {
    if (!synagogueId) return;
    const id = decodeURIComponent(synagogueId);
    trackEvent(id, 'display_open', config?.layout || 'loading');
    return startHeartbeat(id, () => config?.layout || 'loading');
  }, [synagogueId, config?.layout]);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    async function loadZmanim() {
      const now = new Date();
      const result = await fetchHebcalZmanim(config!.cityId, now);
      const shabbatDate = getShabbatZmanimDate(now, result.times);
      const shabbatResult = await fetchHebcalZmanim(config!.cityId, shabbatDate);
      if (cancelled) return;
      setZmanimMap(result.times);
      setShabbatZmanimMap(shabbatResult.times);
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
      if (autoKiosk || window.shulKiosk?.isElectron || isAndroidNative) {
        const r = await enableKiosk(rootRef.current ?? undefined);
        setKioskOn(r.fullscreen || r.wake);
      }
    }
    maybeKiosk();
    const onFs = () => setKioskOn(isFullscreen());
    document.addEventListener('fullscreenchange', onFs);

    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        (kioskOn || autoKiosk || window.shulKiosk?.isElectron || isAndroidNative)
      ) {
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
  }, [autoKiosk, kioskOn, isAndroidNative]);

  if (missing) {
    return <NotFoundScreen screenId={synagogueId} />;
  }

  if (!config) {
    return (
      <div className="display" dir="rtl">
        טוען מסך...
      </div>
    );
  }

  const licenseStatus = getScreenLicenseStatus(config);
  if (!licenseStatus.ok) {
    const payHref = `/login/${synagogueId}?billing=1`;
    return (
      <div className="display license-lock" dir="rtl" lang="he">
        <div className="license-lock-card">
          <BrandLogo size="md" className="license-lock-logo" />
          <h1>{config.name}</h1>
          <p className="license-lock-reason">
            אין רישיון פעיל למסך זה — פנה לספק המערכת
          </p>
          <p className="license-lock-help">
            או עדכן כרטיס אשראי כדי לחדש את הרישיון בתשלום חודשי.
          </p>
          <div className="license-lock-actions">
            <Link className="btn primary" to={payHref}>
              עדכן כרטיס אשראי — לחץ כאן
            </Link>
            <Link className="btn" to={`/login/${synagogueId}`}>
              כניסה לניהול
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
    settled ? 'is-settled' : '',
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
    resolveTime: (item, block) =>
      resolveFromZmanimMap(
        block && isShabbatScheduleBlock(block) ? shabbatZmanimMap : zmanimMap,
        item.time,
        item.fromZman,
        item.offsetMinutes ?? 0,
      ),
    announcement: carouselItem ?? null,
    announcementCount: activeAnnouncements.length,
    announcementIndex: activeAnnouncements.length
      ? carouselIdx % activeAnnouncements.length
      : 0,
    weatherTemp: config.showWeather ? weather?.tempC ?? null : null,
    weatherCode: config.showWeather ? weather?.weatherCode : undefined,
    weatherDesc: config.showWeather ? weather?.description : undefined,
    countdownLabel: modeInfo?.countdownLabel,
    candleBoard: modeInfo?.candleBoard ?? null,
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
      {config.showOmer && day.omer ? (
        <div className="side-block omer-block">
          <h3>ספירת העומר</h3>
          <p className="big">{day.omer.label}</p>
          {day.omer.sefira ? <p className="omer-sefira">{day.omer.sefira}</p> : null}
        </div>
      ) : null}
      {config.showWeather && weather ? (
        <div className="side-block">
          <h3>מזג האוויר</h3>
          <p className="big">
            {(() => {
              const h = new Date().getHours();
              const icon = weatherCodeToIcon(weather.weatherCode, h < 6 || h >= 20);
              return icon ? <span className="weather-icon">{icon}</span> : null;
            })()}
            {weather.tempC}°C
          </p>
          <p className="weather-desc">{weather.description}</p>
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

      {orefDrill || orefMatch ? (
        <div className={`oref-overlay${orefDrill ? ' is-test' : ''}`} role="alert">
          <p className="oref-label">{orefDrill ? 'בדיקת מערכת · פיקוד העורף' : 'פיקוד העורף'}</p>
          <p className="oref-title">
            {categoryLabel(
              (orefDrill || orefMatch)!.alert.cat,
              (orefDrill || orefMatch)!.alert.title,
            )}
          </p>
          <p className="oref-areas">{(orefDrill || orefMatch)!.matchedAreas.join(' · ')}</p>
          {(orefDrill || orefMatch)!.alert.desc ? (
            <p className="oref-desc">{(orefDrill || orefMatch)!.alert.desc}</p>
          ) : null}
        </div>
      ) : null}

      {modeInfo?.candleBoard &&
      (modeInfo.mode !== 'weekday' || modeInfo.countdownLabel) ? (
        <div
          className={`mode-banner mode-${modeInfo.mode !== 'weekday' ? modeInfo.mode : 'erev-shabbat'} candle-banner`}
        >
          {modeInfo.mode !== 'weekday' ? <strong>{modeInfo.label}</strong> : null}
          <CandleTimesBoard
            board={modeInfo.candleBoard}
            showCandles
            showTitle={false}
            className="candle-banner-board"
          />
        </div>
      ) : modeInfo && modeInfo.mode !== 'weekday' ? (
        <div className={`mode-banner mode-${modeInfo.mode}`}>
          <strong>{modeInfo.label}</strong>
          {modeInfo.countdownLabel ? <span>{modeInfo.countdownLabel}</span> : null}
        </div>
      ) : null}

      {special === 'event' ? (
        <div className="event-banner">
          <p className="event-label">אירוע מיוחד</p>
          <h2>{toPlainDisplayText(config.modes.eventTitle) || 'אירוע'}</h2>
          {config.modes.eventSubtitle ? (
            <p>{toPlainDisplayText(config.modes.eventSubtitle)}</p>
          ) : null}
          {media.eventImageUrl ? (
            <img className="event-image" src={media.eventImageUrl} alt="" />
          ) : null}
        </div>
      ) : null}

      {special === 'mourning' ? (
        <div className="mourning-banner">
          <p>{'לע\u05F4נ'}</p>
          <h2>{toPlainDisplayText(config.modes.mourningName) || 'נשמת המנוח/ה'}</h2>
        </div>
      ) : null}

      {media.loopVideoUrl && special === 'event' ? (
        <video className="loop-video" src={media.loopVideoUrl} autoPlay muted loop playsInline />
      ) : null}

      {isCanvas ? (
        <div className="canvas-viewport">
          <CanvasStage
            key={`cv-${config.revision ?? 0}-${config.updatedAt ?? ''}`}
            canvas={config.canvas ?? defaultCanvas()}
            data={canvasData}
          />
        </div>
      ) : null}

      {isCanvas ? null : (
      <header className="display-header">
        <div className="brand">
          {logoSrc ? <img className="brand-logo" src={logoSrc} alt={config.name} /> : null}
          <h1>{config.name}</h1>
          {d.showOrnaments ? <div className={`ornament ${centeredHeader ? 'center' : ''}`} /> : null}
          {config.dedication ? (
            <p className="dedication">{toPlainDisplayText(config.dedication)}</p>
          ) : null}
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
                <h2>{toPlainDisplayText(block.title)}</h2>
                <ul className="schedule-list">
                  {block.items.map((item) => {
                    const blockZmanim = isShabbatScheduleBlock(block)
                      ? shabbatZmanimMap
                      : zmanimMap;
                    const timeStr = item.noTime
                      ? ''
                      : resolveFromZmanimMap(
                          blockZmanim,
                          item.time,
                          item.fromZman,
                          item.offsetMinutes ?? 0,
                        );
                    if (item.noTime || !timeStr) {
                      return (
                        <li key={item.id} className="schedule-heading">
                          <span className="item-title">
                            {toPlainDisplayText(item.title)}
                            {item.note ? <em>{toPlainDisplayText(item.note)}</em> : null}
                          </span>
                        </li>
                      );
                    }
                    return (
                      <li key={item.id}>
                        <span className="item-title">
                          {toPlainDisplayText(item.title)}
                          {item.note ? <em>{toPlainDisplayText(item.note)}</em> : null}
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
                {toPlainDisplayText(carouselItem.text)}
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

      <div className="display-branding-footer">
        screensmart.co.il · 052-4521527
      </div>

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
