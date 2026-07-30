import { useEffect, useState, type FormEvent } from 'react';
import {
  DEFAULT_SERVER,
  goToLiveDisplay,
  loadAndroidKioskConfig,
  probeAndroidConnection,
  saveAndroidKioskConfig,
} from '../lib/androidKiosk';
import './KioskSetup.css';

type Dot = 'pending' | 'checking' | 'ok' | 'bad' | 'warn';

function configMessage(detail: string, ok: boolean): string {
  if (ok) return 'נמצאה הגדרת מסך לקהילה';
  if (detail === 'not-found' || detail === 'empty') {
    return 'השרת זמין אך אין עדיין הגדרה למזהה זה — אפשר להמשיך ולפרסם מהפאנל';
  }
  if (detail === 'missing-id') return 'נא להזין מזהה';
  if (detail === 'bad-id') return 'מזהה מסך לא תקין — השתמשו במספר';
  if (detail === 'server-down') return 'לא נבדק — השרת לא זמין';
  if (detail === 'bad-url') return 'כתובת שרת לא תקינה';
  return `לא ניתן לאמת הגדרה (${detail || 'שגיאה'})`;
}

export function KioskSetup() {
  const [shulId, setShulId] = useState('');
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverDot, setServerDot] = useState<Dot>('pending');
  const [configDot, setConfigDot] = useState<Dot>('pending');
  const [serverDetail, setServerDetail] = useState('טרם נבדק');
  const [configDetail, setConfigDetail] = useState('טרם נבדק');

  useEffect(() => {
    void loadAndroidKioskConfig().then((cfg) => {
      if (cfg.shulId) setShulId(cfg.shulId);
      if (cfg.serverUrl) setServerUrl(cfg.serverUrl);
    });
  }, []);

  async function runChecks(): Promise<boolean> {
    setErr('');
    const id = shulId.trim();
    const server = serverUrl.trim().replace(/\/$/, '');
    if (!id) {
      setErr('נא להזין מזהה');
      return false;
    }
    if (!/^https?:\/\//i.test(server)) {
      setErr('כתובת שרת לא תקינה');
      return false;
    }

    setServerDot('checking');
    setConfigDot('checking');
    setServerDetail('בודקים…');
    setConfigDetail('בודקים…');

    const result = await probeAndroidConnection({ shulId: id, serverUrl: server });
    const serverOk = result.server.ok;
    setServerDot(serverOk ? 'ok' : 'bad');
    setServerDetail(serverOk ? 'השרת מגיב' : 'לא ניתן להגיע לשרת — בדקו רשת וכתובת');

    const configOk = result.config.ok;
    setConfigDot(configOk ? 'ok' : serverOk ? 'warn' : 'bad');
    setConfigDetail(configMessage(result.config.detail, configOk));

    if (!serverOk) {
      setErr('השרת לא זמין — לא ניתן להמשיך עד שהחיבור יצליח');
    }
    return serverOk;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const ok = await runChecks();
      if (!ok) return;
      const id = shulId.trim();
      const server = serverUrl.trim().replace(/\/$/, '');
      await saveAndroidKioskConfig({ shulId: id, serverUrl: server });
      goToLiveDisplay(id, server);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'שגיאה');
      setBusy(false);
    }
  }

  return (
    <div className="kiosk-setup" dir="rtl">
      <form className="kiosk-setup-card" onSubmit={(e) => void onSubmit(e)}>
        <p className="kiosk-setup-brand">
          <img src="/screensmart-mark.png" alt="screensmart" width={72} height={72} />
        </p>
        <h1>רישום מסך Android</h1>
        <p className="kiosk-setup-lead">
          הזינו את מזהה המסך המספרי מהמערכת (למשל 12, כמו בכתובת /display/12). הפרטים נשמרים במכשיר זה.
        </p>

        <label>
          מזהה מסך
          <input
            className="ltr"
            required
            minLength={1}
            maxLength={12}
            placeholder="12"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            value={shulId}
            onChange={(e) => setShulId(e.target.value.replace(/\D/g, '').slice(0, 12))}
          />
        </label>
        <label>
          כתובת שרת
          <input
            className="ltr"
            required
            type="url"
            autoComplete="off"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
          />
        </label>

        <ul className="kiosk-setup-checks" aria-live="polite">
          <li>
            <span className={`dot ${serverDot}`} aria-hidden />
            <span>
              שרת זמין
              <span className="check-detail">{serverDetail}</span>
            </span>
          </li>
          <li>
            <span className={`dot ${configDot}`} aria-hidden />
            <span>
              הגדרת מסך בענן
              <span className="check-detail">{configDetail}</span>
            </span>
          </li>
        </ul>

        <div className="kiosk-setup-tips">
          <strong>טיפים להתקנה</strong>
          נעלו את האפליקציה למצב קיוסק / pin, השאירו מסך דולק, וודאו אינטרנט יציב. מדריך:{' '}
          <span className="ltr">/guide</span>
        </div>

        {err ? <p className="kiosk-setup-err">{err}</p> : <p className="kiosk-setup-err" />}

        <div className="kiosk-setup-actions">
          <button type="button" disabled={busy} onClick={() => void runChecks()}>
            בדיקת חיבור
          </button>
          <button type="submit" className="primary" disabled={busy}>
            שמור והפעל מסך
          </button>
        </div>
      </form>
    </div>
  );
}
