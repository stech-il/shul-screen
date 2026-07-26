import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  fetchInquiries,
  INQUIRY_STATUS_LABELS,
  INQUIRY_TOPIC_LABELS,
  submitInquiry,
  updateInquiryStatus,
  type Inquiry,
  type InquiryStatus,
  type InquiryTopic,
} from '../lib/inquiries';
import './InquiriesPanel.css';

type Mode = 'admin' | 'agency';

interface Props {
  mode: Mode;
  synagogueId?: string;
  synagogueName?: string;
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
  /** Agency: manage status. Admin: submit + view own tickets only */
  canManage?: boolean;
}

export function InquiriesPanel({
  mode,
  synagogueId = '',
  synagogueName = '',
  defaultName = '',
  defaultEmail = '',
  defaultPhone = '',
  canManage = mode === 'agency',
}: Props) {
  const [items, setItems] = useState<Inquiry[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<'all' | InquiryStatus>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);
  const [topic, setTopic] = useState<InquiryTopic>('fault');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [formMsg, setFormMsg] = useState('');

  useEffect(() => {
    setName(defaultName);
    setEmail(defaultEmail);
    setPhone(defaultPhone);
  }, [defaultName, defaultEmail, defaultPhone]);

  async function reload() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchInquiries({
        synagogueId: mode === 'admin' ? synagogueId : undefined,
      });
      setItems(data.items);
      setUnread(data.unread);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'טעינת פניות נכשלה');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on synagogue/mode
  }, [mode, synagogueId]);

  const visible = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((i) => i.status === filter);
  }, [items, filter]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!synagogueId) {
      setFormMsg('חסר מזהה בית כנסת');
      return;
    }
    setSending(true);
    setFormMsg('');
    try {
      await submitInquiry({
        name,
        email,
        phone,
        topic,
        message,
        synagogueId,
        source: 'admin',
      });
      setMessage('');
      setTopic('fault');
      setFormMsg('הפנייה נשלחה לתמיכה — נחזור אליכם בהקדם.');
      await reload();
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : 'שליחה נכשלה');
    } finally {
      setSending(false);
    }
  }

  async function onStatus(id: string, status: InquiryStatus) {
    setBusyId(id);
    try {
      await updateInquiryStatus(id, status);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'עדכון נכשל');
    } finally {
      setBusyId(null);
    }
  }

  const topicOptions = (Object.keys(INQUIRY_TOPIC_LABELS) as InquiryTopic[]).filter((id) =>
    mode === 'admin'
      ? ['fault', 'support', 'content', 'billing', 'feature', 'other'].includes(id)
      : true,
  );

  return (
    <div className={`inq-panel mode-${mode}`}>
      {mode === 'admin' ? (
        <section className="inq-compose card">
          <h2>פתיחת פנייה</h2>
          <p className="hint">
            תקלות, שאלות ותמיכה — הפנייה מגיעה למנהל המערכת{synagogueName ? ` · ${synagogueName}` : ''}
            , עם התראה במייל כש־SMTP מוגדר.
          </p>
          <form className="inq-form" onSubmit={(e) => void onSubmit(e)}>
            <div className="inq-form-grid">
              <label>
                שם
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
              <label>
                מייל לחזרה
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  dir="ltr"
                  style={{ textAlign: 'left' }}
                />
              </label>
              <label>
                טלפון
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  style={{ textAlign: 'left' }}
                />
              </label>
              <label>
                סוג פנייה
                <select value={topic} onChange={(e) => setTopic(e.target.value as InquiryTopic)}>
                  {topicOptions.map((id) => (
                    <option key={id} value={id}>
                      {INQUIRY_TOPIC_LABELS[id]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              פירוט
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                minLength={5}
                maxLength={4000}
                rows={5}
                placeholder="תארו את התקלה או הבקשה — מה קורה במסך, מתי התחיל, ומה ניסיתם…"
              />
            </label>
            <div className="inq-form-actions">
              <button type="submit" className="btn primary" disabled={sending}>
                {sending ? 'שולח…' : 'שלחו פנייה'}
              </button>
              {formMsg ? <p className="hint inq-form-msg">{formMsg}</p> : null}
            </div>
          </form>
        </section>
      ) : null}

      <section className="inq-inbox card">
        <div className="inq-inbox-head">
          <div>
            <h2>
              {mode === 'agency' ? 'תיבת פניות' : 'הפניות שלכם'}
              {unread > 0 && mode === 'agency' ? (
                <span className="inq-badge">{unread} חדשות</span>
              ) : null}
            </h2>
            <p className="hint">
              {mode === 'agency'
                ? 'פניות מבתי הכנסת (תקלות, תמיכה, תשלום ועוד).'
                : 'סטטוס הפניות ששלחתם מניהול המסך.'}
            </p>
          </div>
          <div className="inq-inbox-tools">
            <div className="inq-filters" role="group" aria-label="סינון">
              {(
                [
                  ['all', 'הכל'],
                  ['new', 'חדשות'],
                  ['read', 'בטיפול'],
                  ['done', 'טופלו'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={filter === id ? 'on' : ''}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="btn ghost" onClick={() => void reload()}>
              רענן
            </button>
          </div>
        </div>

        {error ? <p className="hint warn">{error}</p> : null}
        {loading && items.length === 0 ? <p className="hint">טוען…</p> : null}
        {!loading && visible.length === 0 ? (
          <p className="hint">{mode === 'admin' ? 'עדיין לא נשלחו פניות.' : 'אין פניות להצגה.'}</p>
        ) : (
          <ul className="inq-list">
            {visible.map((inq) => {
              const topicLabel =
                INQUIRY_TOPIC_LABELS[inq.topic as InquiryTopic] || inq.topic;
              const statusLabel =
                INQUIRY_STATUS_LABELS[inq.status as InquiryStatus] || inq.status;
              return (
                <li key={inq.id} className={`inq-item status-${inq.status}`}>
                  <div className="inq-item-top">
                    <strong>{inq.name}</strong>
                    <span className="inq-topic">{topicLabel}</span>
                    <span className={`inq-status status-${inq.status}`}>{statusLabel}</span>
                    <time dateTime={inq.createdAt}>
                      {new Date(inq.createdAt).toLocaleString('he-IL')}
                    </time>
                  </div>
                  <p className="inq-meta">
                    <a href={`mailto:${inq.email}`} dir="ltr">
                      {inq.email}
                    </a>
                    {inq.phone ? (
                      <>
                        {' · '}
                        <a href={`tel:${inq.phone}`} dir="ltr">
                          {inq.phone}
                        </a>
                      </>
                    ) : null}
                    {mode === 'agency' && inq.synagogueId
                      ? ` · בית כנסת: ${inq.synagogueId}`
                      : null}
                  </p>
                  <p className="inq-body">{inq.message}</p>
                  {canManage ? (
                    <div className="inq-item-actions">
                      {inq.status === 'new' ? (
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={busyId === inq.id}
                          onClick={() => void onStatus(inq.id, 'read')}
                        >
                          בטיפול
                        </button>
                      ) : null}
                      {inq.status !== 'done' ? (
                        <button
                          type="button"
                          className="btn primary"
                          disabled={busyId === inq.id}
                          onClick={() => void onStatus(inq.id, 'done')}
                        >
                          טופל
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={busyId === inq.id}
                          onClick={() => void onStatus(inq.id, 'read')}
                        >
                          פתח מחדש
                        </button>
                      )}
                      <a
                        className="btn ghost"
                        href={`mailto:${inq.email}?subject=${encodeURIComponent(`Re: ${topicLabel}`)}`}
                      >
                        השב במייל
                      </a>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
