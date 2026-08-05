import { useEffect, useState, type FormEvent } from 'react';
import type { LicenseInfo } from '../types';
import { useI18n } from '../i18n';
import {
  applyBillingCoupon,
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
  const { t } = useI18n();
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
  const [couponCode, setCouponCode] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMsg, setCouponMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Local store only — SUMIT is pulled at most weekly by the server (or via refresh)
    Promise.all([
      fetchBillingConfig(),
      fetchSubscription(synagogueId).catch(() => null),
    ])
      .then(([cfg, s]) => {
        if (cancelled) return;
        setConfig(cfg);
        setSub(s);
        if (s?.payerEmail) setPayerEmail(s.payerEmail);
        if (s?.payerName) setPayerName(s.payerName);
        if (s?.couponCode) setCouponCode(s.couponCode);
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

  function statusLabel(status: string | undefined) {
    if (status === 'active') return t('billing.statusActive');
    if (status === 'failed') return t('billing.statusFailed');
    if (status === 'canceled') return t('billing.statusCanceled');
    return t('billing.statusUnknown');
  }

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
        couponCode: couponCode.trim() || undefined,
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
          ? t('billing.paymentOkNoStanding', { until })
          : t('billing.paymentOk', { until }),
      );
      onRenewed?.(license);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('billing.paymentFail'));
    } finally {
      setBusy(false);
    }
  }

  async function onApplyCoupon() {
    const code = couponCode.trim();
    if (!code) {
      setCouponMsg(t('billing.enterCoupon'));
      return;
    }
    setCouponBusy(true);
    setCouponMsg('');
    try {
      const { subscription: next, preview } = await applyBillingCoupon(synagogueId, code);
      setSub(next);
      setCouponMsg(
        preview.label || t('billing.couponApplied', { amount: formatIls(preview.amount) }),
      );
    } catch (err) {
      setCouponMsg(err instanceof Error ? err.message : t('billing.couponFail'));
    } finally {
      setCouponBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="card">
        <h2>{t('panels.billingTitle')}</h2>
        <p className="hint">{t('panels.billingLoading')}</p>
      </section>
    );
  }

  if (!config?.configured) {
    return (
      <section className="card">
        <h2>{t('panels.billingTitle')}</h2>
        <p className="hint">{t('panels.billingNotConfigured')}</p>
      </section>
    );
  }

  const amountSet = (sub?.amount ?? 0) > 0 || (sub?.listAmount ?? 0) > 0;
  const listAmount = sub?.listAmount && sub.listAmount > sub.amount ? sub.listAmount : null;
  const invoices = sub?.history ?? [];

  return (
    <section className="card">
      <h2>{t('panels.billingTitleStanding')}</h2>

      {!amountSet ? (
        <p className="hint">{t('panels.billingNoAmount')}</p>
      ) : (
        <>
          <p>
            {t('panels.billingMonthly')}{' '}
            {listAmount ? (
              <>
                <s>{formatIls(listAmount)}</s>{' '}
                <strong>{formatIls(sub!.amount)}</strong>
              </>
            ) : (
              <strong>{formatIls(sub!.amount)}</strong>
            )}{' '}
            {t('billing.renewNote')}
          </p>
          {sub?.discountLabel ? <p className="hint">{sub.discountLabel}</p> : null}

          {!sub?.hasPaymentMethod ? (
            <div className="billing-coupon">
              <label>
                {t('billing.couponLabel')}
                <div className="billing-row">
                  <input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="WELCOME20"
                    dir="ltr"
                    style={{ textAlign: 'left' }}
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={couponBusy || !couponCode.trim()}
                    onClick={() => void onApplyCoupon()}
                  >
                    {couponBusy ? t('billing.checking') : t('billing.applyCoupon')}
                  </button>
                </div>
              </label>
              {couponMsg ? <p className="hint">{couponMsg}</p> : null}
            </div>
          ) : null}

          {sub?.hasPaymentMethod ? (
            <p className="hint">
              {t('billing.cardSaved', {
                mask: sub.cardMask || '????',
                status: statusLabel(sub.status),
                until: formatBillingDate(sub.paidUntil),
              })}
            </p>
          ) : (
            <p className="hint">{t('billing.noCard')}</p>
          )}
          {sub?.lastError ? (
            <p className="hint" style={{ color: '#a33' }}>
              {t('billing.lastError', { error: sub.lastError })}
            </p>
          ) : null}

          {!showForm ? (
            <div className="billing-row">
              <button type="button" className="btn primary" onClick={() => setShowForm(true)}>
                {sub?.hasPaymentMethod ? t('panels.billingUpdateCard') : t('panels.billingEnterCard')}
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="billing-form">
              <label>
                {t('billing.payerName')}
                <input value={payerName} onChange={(e) => setPayerName(e.target.value)} required />
              </label>
              <label>
                {t('billing.payerEmail')}
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
                {t('billing.cardNumber')}
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
                  {t('billing.month')}
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
                  {t('billing.year')}
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
                  {t('billing.cvvOptional')}
                  <input
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value)}
                    inputMode="numeric"
                    maxLength={4}
                    dir="ltr"
                    placeholder={t('billing.cvvPlaceholder')}
                  />
                </label>
              </div>
              <label>
                {t('billing.citizenId')}
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
                {t('billing.secureHint', { amount: formatIls(sub!.amount) })}
              </p>
              <div className="billing-row">
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy
                    ? t('billing.charging')
                    : t('billing.payAndActivate', { amount: formatIls(sub!.amount) })}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => setShowForm(false)}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          )}

          {invoices.length ? (
            <div className="billing-invoices">
              <h3>{t('billing.historyTitle')}</h3>
              <ul>
                {invoices.map((h, i) => (
                  <li key={`${h.at}-${i}`}>
                    <span>
                      {formatBillingDate(h.at)} · {formatIls(h.amount)}
                      {h.ok ? '' : t('billing.failed')}
                      {h.documentNumber ? t('billing.docNumber', { n: h.documentNumber }) : ''}
                      {h.error ? ` — ${h.error}` : ''}
                    </span>
                    {h.ok && h.documentUrl ? (
                      <a href={h.documentUrl} target="_blank" rel="noreferrer" dir="ltr">
                        {t('billing.download')}
                      </a>
                    ) : h.ok ? (
                      <span className="hint">{t('billing.savedCloud')}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="hint">{t('panels.billingEmptyHistory')}</p>
          )}
        </>
      )}

      {msg ? <p className="hint">{msg}</p> : null}
    </section>
  );
}
