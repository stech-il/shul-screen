import { useEffect, useState, type FormEvent } from 'react';
import type { LicenseInfo } from '../types';
import {
  fetchBillingConfig,
  fetchSubscription,
  formatBillingDate,
  formatIls,
  subscribeBilling,
  tokenizeCard,
  type BillingConfig,
  type BillingSubscription,
} from '../lib/billing';

interface Props {
  synagogueId: string;
  /** Called after a successful payment with the new 1-month license */
  onRenewed?: (license: LicenseInfo | null) => void;
}

/** Synagogue-side recurring payment (הוראת קבע) via SUMIT. */
export function BillingCard({ synagogueId, onRenewed }: Props) {
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [sub, setSub] = useState<BillingSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [payerName, setPayerName] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [citizenId, setCitizenId] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // sync=1 pulls invoices from SUMIT so history appears even if a prior save failed
    Promise.all([
      fetchBillingConfig(),
      fetchSubscription(synagogueId, { sync: true }).catch(() =>
        fetchSubscription(synagogueId).catch(() => null),
      ),
    ])
      .then(([cfg, s]) => {
        if (cancelled) return;
        setConfig(cfg);
        setSub(s);
        if (s?.payerEmail) setPayerEmail(s.payerEmail);
        if (s?.payerName) setPayerName(s.payerName);
      })
      .catch(() => {
        if (!cancelled) setConfig({ configured: false, companyId: null, publicKey: null });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [synagogueId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setMsg('');
    setBusy(true);
    try {
      const token = await tokenizeCard(config, {
        cardNumber,
        expMonth,
        expYear,
        cvv,
        citizenId,
      });
      const { subscription: next, license } = await subscribeBilling(synagogueId, {
        singleUseToken: token,
        name: payerName,
        email: payerEmail,
      });
      setSub(next);
      setShowForm(false);
      setCardNumber('');
      setCvv('');
      const until = license?.expiresAt
        ? formatBillingDate(license.expiresAt)
        : formatBillingDate(next.paidUntil);
      setMsg(
        next.hasStandingOrder === false
          ? `התשלום בוצע והרישיון חודש עד ${until}, אך הו״ק לא נוצרה ב־SUMIT — עדכן כרטיס שוב או פנה לתמיכה.`
          : `התשלום בוצע — הרישיון חודש עד ${until}. הוראת הקבע פעילה.`,
      );
      onRenewed?.(license);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'התשלום נכשל');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="card">
        <h2>תשלום ורישיון</h2>
        <p className="hint">טוען…</p>
      </section>
    );
  }

  if (!config?.configured) {
    return (
      <section className="card">
        <h2>תשלום ורישיון</h2>
        <p className="hint">סליקה עדיין לא הופעלה במערכת. פנה לספק המערכת.</p>
      </section>
    );
  }

  const amountSet = (sub?.amount ?? 0) > 0;
  const invoices = sub?.history ?? [];

  return (
    <section className="card">
      <h2>תשלום ורישיון — הוראת קבע</h2>

      {!amountSet ? (
        <p className="hint">ספק המערכת עדיין לא קבע סכום חודשי לבית כנסת זה. פנה אליו להפעלה.</p>
      ) : (
        <>
          <p>
            מנוי חודשי: <strong>{formatIls(sub!.amount)}</strong> — כל חיוב מוצלח מחדש את
            רישיון המסך לחודש נוסף.
          </p>
          {sub?.hasPaymentMethod ? (
            <p className="hint">
              כרטיס שמור: •••• {sub.cardMask || '????'} · סטטוס:{' '}
              {sub.status === 'active'
                ? 'פעיל'
                : sub.status === 'failed'
                  ? 'חיוב אחרון נכשל'
                  : sub.status === 'canceled'
                    ? 'מבוטל'
                    : '—'}{' '}
              · שולם עד: {formatBillingDate(sub.paidUntil)}
              {sub.hasStandingOrder ? ' · הו״ק פעילה ב־SUMIT' : ' · הו״ק עדיין לא נוצרה ב־SUMIT'}
            </p>
          ) : (
            <p className="hint">עדיין לא הוזן כרטיס אשראי.</p>
          )}
          {sub?.lastError ? (
            <p className="hint" style={{ color: '#a33' }}>
              שגיאה אחרונה: {sub.lastError}
            </p>
          ) : null}

          {!showForm ? (
            <button type="button" className="btn primary" onClick={() => setShowForm(true)}>
              {sub?.hasPaymentMethod ? 'עדכן כרטיס אשראי' : 'הזן כרטיס אשראי והפעל'}
            </button>
          ) : (
            <form onSubmit={onSubmit} className="billing-form">
              <label>
                שם בעל הכרטיס
                <input value={payerName} onChange={(e) => setPayerName(e.target.value)} required />
              </label>
              <label>
                אימייל לקבלת חשבונית
                <input
                  type="email"
                  value={payerEmail}
                  onChange={(e) => setPayerEmail(e.target.value)}
                  required
                  dir="ltr"
                  style={{ textAlign: 'left' }}
                  placeholder="name@example.com"
                />
              </label>
              <label>
                מספר כרטיס
                <input
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  required
                  inputMode="numeric"
                  autoComplete="cc-number"
                  dir="ltr"
                  style={{ textAlign: 'left' }}
                  placeholder="0000 0000 0000 0000"
                />
              </label>
              <div className="billing-row">
                <label>
                  חודש
                  <input
                    value={expMonth}
                    onChange={(e) => setExpMonth(e.target.value)}
                    required
                    inputMode="numeric"
                    maxLength={2}
                    placeholder="MM"
                    dir="ltr"
                  />
                </label>
                <label>
                  שנה
                  <input
                    value={expYear}
                    onChange={(e) => setExpYear(e.target.value)}
                    required
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="YYYY"
                    dir="ltr"
                  />
                </label>
                <label>
                  CVV (לא חובה)
                  <input
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value)}
                    inputMode="numeric"
                    maxLength={4}
                    dir="ltr"
                    placeholder="אופציונלי"
                  />
                </label>
              </div>
              <label>
                ת״ז בעל הכרטיס
                <input
                  value={citizenId}
                  onChange={(e) => setCitizenId(e.target.value)}
                  required
                  inputMode="numeric"
                  maxLength={9}
                  dir="ltr"
                  style={{ textAlign: 'left' }}
                />
              </label>
              <p className="hint">
                פרטי הכרטיס מאובטחים ונשלחים ישירות ל־SUMIT — הם לא נשמרים בשרת המערכת.
                החיוב הראשון ({formatIls(sub!.amount)}) יתבצע מיד ויחדש רישיון לחודש.
              </p>
              <div className="billing-row">
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? 'מבצע חיוב…' : `שלם ${formatIls(sub!.amount)} והפעל הו״ק`}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => setShowForm(false)}
                >
                  ביטול
                </button>
              </div>
            </form>
          )}

          {invoices.length ? (
            <div className="billing-invoices">
              <h3>היסטוריית חיובים</h3>
              <ul>
                {invoices.map((h, i) => (
                  <li key={`${h.at}-${i}`}>
                    <span>
                      {formatBillingDate(h.at)} · {formatIls(h.amount)}
                      {h.ok ? '' : ' · נכשל'}
                      {h.documentNumber ? ` · מס׳ ${h.documentNumber}` : ''}
                      {h.error ? ` — ${h.error}` : ''}
                    </span>
                    {h.ok && h.documentUrl ? (
                      <a href={h.documentUrl} target="_blank" rel="noreferrer" dir="ltr">
                        הורדה
                      </a>
                    ) : h.ok ? (
                      <span className="hint">נשמר ב־SUMIT</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="hint">אין חיובים להצגה עדיין.</p>
          )}
        </>
      )}

      {msg ? <p className="hint">{msg}</p> : null}
    </section>
  );
}
