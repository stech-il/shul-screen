import { useEffect, useState, type FormEvent } from 'react';
import {
  deleteCoupon,
  fetchCoupons,
  formatIls,
  saveCoupon,
  type BillingCoupon,
} from '../lib/billing';
import { useAppNotice } from './AppNotice';
import './CouponsPanel.css';

export function CouponsPanel() {
  const { confirm: askConfirm } = useAppNotice();
  const [items, setItems] = useState<BillingCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('20');
  const [maxUses, setMaxUses] = useState('0');
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');

  async function reload() {
    setLoading(true);
    try {
      setItems(await fetchCoupons());
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'טעינת קופונים נכשלה');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await saveCoupon({
        code,
        type,
        value: Number(value),
        maxUses: Number(maxUses) || 0,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        note,
        active: true,
      });
      setCode('');
      setNote('');
      setExpiresAt('');
      setMsg('הקופון נשמר — אפשר לחלק את הקוד ללקוחות');
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'שמירת קופון נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(c: BillingCoupon) {
    if (
      !(await askConfirm({
        message: `למחוק / לבטל את הקופון «${c.code}»?`,
        confirmLabel: 'בטל קופון',
        danger: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteCoupon(c.code);
      await reload();
      setMsg(`הקופון ${c.code} בוטל`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'מחיקה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="coupons-panel side-card settings-panel">
      <div className="settings-panel-head">
        <span className="settings-panel-tag">שיווק</span>
        <h2>קופוני הנחה</h2>
        <p className="hint">
          קוד הנחה ללקוחות — מוזן במסך התשלום והסכום החודשי מתעדכן אוטומטית.
        </p>
      </div>

      <form className="coupons-form" onSubmit={(e) => void onCreate(e)}>
        <label>
          קוד
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            minLength={3}
            maxLength={32}
            placeholder="WELCOME20"
            dir="ltr"
            style={{ textAlign: 'left' }}
          />
        </label>
        <label>
          סוג
          <select value={type} onChange={(e) => setType(e.target.value as 'percent' | 'fixed')}>
            <option value="percent">אחוזים</option>
            <option value="fixed">סכום קבוע (₪)</option>
          </select>
        </label>
        <label>
          ערך
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            inputMode="decimal"
            dir="ltr"
          />
        </label>
        <label>
          מכסת שימושים (0 = ללא הגבלה)
          <input
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            inputMode="numeric"
            dir="ltr"
          />
        </label>
        <label>
          תפוגה (אופציונלי)
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </label>
        <label className="coupons-note">
          הערה פנימית
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: מבצע פסח" />
        </label>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'שומר…' : 'צור קופון'}
        </button>
      </form>

      {msg ? <p className="hint">{msg}</p> : null}
      {loading ? <p className="hint">טוען…</p> : null}

      <ul className="coupons-list">
        {items.map((c) => (
          <li key={c.code}>
            <div>
              <strong dir="ltr">{c.code}</strong>
              <span>
                {c.type === 'percent' ? `${c.value}%` : formatIls(c.value)}
                {c.active ? '' : ' · כבוי'}
                {' · '}
                {c.usedCount}
                {c.maxUses > 0 ? `/${c.maxUses}` : ''} שימושים
                {c.expiresAt
                  ? ` · עד ${new Date(c.expiresAt).toLocaleDateString('he-IL')}`
                  : ''}
                {c.note ? ` · ${c.note}` : ''}
              </span>
            </div>
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => void onDelete(c)}
            >
              בטל
            </button>
          </li>
        ))}
      </ul>
      {!loading && items.length === 0 ? <p className="hint">עדיין אין קופונים.</p> : null}
    </div>
  );
}
