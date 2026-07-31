import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { CandleTimesBoard } from '../components/CandleTimesBoard';
import { NotFoundScreen } from '../components/NotFoundScreen';
import {
  fetchHebcalZmanim,
  getShabbatZmanimDate,
  isShabbatScheduleBlock,
  pickEnabledZmanim,
  resolveFromZmanimMap,
  type HebcalZmanimResult,
} from '../lib/hebcalZmanim';
import { getDayInfo } from '../lib/jewish';
import { subscribeLiveUpdates } from '../lib/liveSync';
import { getModeInfo } from '../lib/modes';
import { toPlainDisplayText } from '../lib/sanitizeHtml';
import { isAnnouncementActive, startAutoSync, syncConfig } from '../lib/storage';
import type { ComputedZman, DayInfo, ModeInfo, SynagogueConfig, ZmanKey } from '../types';
import './CongregantTimes.css';

export function CongregantTimes() {
  const { id } = useParams();
  let synagogueId = id || '';
  try {
    synagogueId = decodeURIComponent(synagogueId);
  } catch {
    /* keep raw */
  }

  const [config, setConfig] = useState<SynagogueConfig | null>(null);
  const [missing, setMissing] = useState(false);
  const [zmanim, setZmanim] = useState<ComputedZman[]>([]);
  const [zmanimMap, setZmanimMap] = useState<HebcalZmanimResult['times']>({});
  const [shabbatZmanimMap, setShabbatZmanimMap] = useState<HebcalZmanimResult['times']>({});
  const [day, setDay] = useState<DayInfo>(getDayInfo());
  const [modeInfo, setModeInfo] = useState<ModeInfo | null>(null);

  useEffect(() => {
    if (!synagogueId) return;
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
      if (!cancelled) setConfig(next);
    });
    void load();
    return () => {
      cancelled = true;
      stopSync();
      live?.stop();
    };
  }, [synagogueId]);

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
    void loadZmanim();
    const onOnline = () => void loadZmanim();
    const interval = setInterval(onOnline, 15 * 60_000);
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [config?.cityId, config?.enabledZmanim]);

  useEffect(() => {
    function tick() {
      const now = new Date();
      setDay(getDayInfo(now, config?.yahrzeits ?? []));
      if (config) setModeInfo(getModeInfo(config.cityId, config.modes, now));
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [config?.cityId, config?.modes, config?.yahrzeits]);

  const announcements = useMemo(() => {
    if (!config) return [];
    return config.announcements.filter((a) => isAnnouncementActive(a));
  }, [config, day.hebrewDate]);

  const blocks = useMemo(() => {
    if (!config) return [];
    return config.blocks.filter((b) => b.enabled).filter((b) => {
      if (!modeInfo || modeInfo.mode === 'weekday' || modeInfo.mode === 'erev-shabbat') {
        return true;
      }
      if (modeInfo.mode === 'shabbat') {
        const title = b.title;
        if (/חול/.test(title) && /שבת/.test(title) === false) return false;
      }
      return true;
    });
  }, [config, modeInfo]);

  if (!synagogueId) return <NotFoundScreen screenId="" />;
  if (missing) return <NotFoundScreen screenId={synagogueId} />;
  if (!config) {
    return (
      <div className="ct-page ct-loading" dir="rtl" lang="he">
        <p>טוען זמנים…</p>
      </div>
    );
  }

  const logoSrc =
    config.media?.logoDataUrl || config.design?.logoUrl || config.branding?.logoUrl || '';

  return (
    <div className="ct-page" dir="rtl" lang="he">
      <div className="ct-atmosphere" aria-hidden />
      <header className="ct-hero">
        {logoSrc ? <img className="ct-logo" src={logoSrc} alt="" /> : null}
        <h1 className="ct-name">{toPlainDisplayText(config.name)}</h1>
        <p className="ct-date">
          יום {day.weekday} · {day.hebrewDate}
        </p>
        {day.parasha ? <p className="ct-parasha">פרשת {day.parasha}</p> : null}
      </header>

      {modeInfo?.candleBoard &&
      (modeInfo.mode !== 'weekday' || modeInfo.countdownLabel) ? (
        <section className="ct-card ct-candles">
          {modeInfo.mode !== 'weekday' ? (
            <h2>{modeInfo.label}</h2>
          ) : (
            <h2>כניסת שבת</h2>
          )}
          <CandleTimesBoard board={modeInfo.candleBoard} showCandles showTitle={false} />
        </section>
      ) : null}

      {blocks.map((block) => (
        <section className="ct-card" key={block.id}>
          <h2>{toPlainDisplayText(block.title)}</h2>
          <ul className="ct-list">
            {block.items.map((item) => {
              const blockZmanim = isShabbatScheduleBlock(block) ? shabbatZmanimMap : zmanimMap;
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
                  <li key={item.id} className="ct-heading">
                    <span>
                      {toPlainDisplayText(item.title)}
                      {item.note ? <em>{toPlainDisplayText(item.note)}</em> : null}
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.id}>
                  <span>
                    {toPlainDisplayText(item.title)}
                    {item.note ? <em>{toPlainDisplayText(item.note)}</em> : null}
                  </span>
                  <strong className="time-ltr">{timeStr}</strong>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {announcements.length > 0 ? (
        <section className="ct-card ct-announce">
          <h2>הודעות</h2>
          <ul className="ct-announce-list">
            {announcements.map((a) => (
              <li key={a.id}>{toPlainDisplayText(a.text)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {zmanim.length > 0 ? (
        <section className="ct-card">
          <h2>זמני היום</h2>
          <ul className="ct-list">
            {zmanim.map((z) => (
              <li key={z.key}>
                <span>{z.label}</span>
                <strong className="time-ltr">{z.formatted}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="ct-footer">
        <BrandLogo size="sm" />
        <span>screensmart · זמני בית הכנסת</span>
      </footer>
    </div>
  );
}
