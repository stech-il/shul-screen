import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  fetchInquiries,
  INQUIRY_STATUS_LABELS,
  INQUIRY_TOPIC_LABELS,
  replyToInquiry,
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
  const [unreadCustomer, setUnreadCustomer] = useState(0);
  const [filter, setFilter] = useState<'all' | InquiryStatus>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

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
      setUnreadCustomer(data.unreadCustomer || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'טעינת פניות נכשלה');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), 20_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const result = await submitInquiry({
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
      setFormMsg('הפנייה נשלחה — התשובות יופיעו כאן במערכת.');
      await reload();
      if (result.id) setOpenId(result.id);
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

  async function onReply(inq: Inquiry) {
    const text = (replyDrafts[inq.id] || '').trim();
    if (!text) return;
    setBusyId(inq.id);
    try {
      const author = mode === 'agency' ? 'support' : 'customer';
      const replyName =
        mode === 'agency' ? 'תמיכת screensmart' : name || defaultName || inq.name;
      await replyToInquiry({ id: inq.id, text, author, name: replyName });
      setReplyDrafts((d) => ({ ...d, [inq.id]: '' }));
      await reload();
      setOpenId(inq.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שליחת התשובה נכשלה');
    } finally {
      setBusyId(null);
    }
  }

  const topicOptions = (Object.keys(INQUIRY_TOPIC_LABELS) as InquiryTopic[]).filter((id) =>
    mode === 'admin'
      ? ['fault', 'support', 'content', 'billing', 'feature', 'other'].includes(id)
      : true,
  );

  const badgeCount = mode === 'agency' ? unread : unreadCustomer;

  return (
    <div className={`inq-panel mode-${mode}`}>
      {mode === 'admin' ? (
        <section className="inq-compose card">
          <h2>פתיחת פנייה</h2>
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
                מייל להתראות
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
                placeholder="תארו את התקלה או הבקשה…"
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
              {mode === 'agency' ? 'תיבת פניות' : 'הפניות והתשובות'}
              {badgeCount > 0 ? (
                <span className="inq-badge">
                  {badgeCount} {mode === 'agency' ? 'ממתינות' : 'תשובות חדשות'}
                </span>
              ) : null}
            </h2>
            <p className="hint">
              {mode === 'agency'
                ? 'השיבו כאן במערכת — הלקוח רואה את התשובה בניהול המסך.'
                : 'כאן מופיעות תשובות התמיכה. אפשר להמשיך את השיחה מהמערכת.'}
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
              const open = openId === inq.id;
              const messages = inq.messages?.length
                ? inq.messages
                : [
                    {
                      id: 'legacy',
                      at: inq.createdAt,
                      author: 'customer',
                      name: inq.name,
                      text: inq.message,
                    },
                  ];
              const waitingForMe =
                (mode === 'agency' && inq.awaiting === 'support') ||
                (mode === 'admin' && inq.awaiting === 'customer');

              return (
                <li
                  key={inq.id}
                  className={`inq-item status-${inq.status} ${waitingForMe ? 'needs-reply' : ''} ${open ? 'is-open' : ''}`}
                >
                  <button
                    type="button"
                    className="inq-item-summary"
                    onClick={() => setOpenId(open ? null : inq.id)}
                  >
                    <div className="inq-item-top">
                      <strong>{inq.name}</strong>
                      <span className="inq-topic">{topicLabel}</span>
                      <span className={`inq-status status-${inq.status}`}>{statusLabel}</span>
                      {waitingForMe ? <span className="inq-await">ממתין לתשובה</span> : null}
                      <time dateTime={inq.updatedAt || inq.createdAt}>
                        {new Date(inq.updatedAt || inq.createdAt).toLocaleString('he-IL')}
                      </time>
                    </div>
                    <p className="inq-preview">
                      {messages[messages.length - 1]?.text?.slice(0, 120)}
                      {(messages[messages.length - 1]?.text?.length || 0) > 120 ? '…' : ''}
                    </p>
                    <span className="inq-thread-toggle">
                      {open ? 'סגור שיחה' : `פתח שיחה (${messages.length})`}
                    </span>
                  </button>

                  {open ? (
                    <div className="inq-thread">
                      <p className="inq-meta">
                        {inq.email ? <span dir="ltr">{inq.email}</span> : null}
                        {inq.phone ? (
                          <>
                            {' · '}
                            <span dir="ltr">{inq.phone}</span>
                          </>
                        ) : null}
                        {mode === 'agency' && inq.synagogueId
                          ? ` · בית כנסת: ${inq.synagogueId}`
                          : null}
                      </p>

                      <ul className="inq-messages">
                        {messages.map((m) => (
                          <li
                            key={m.id}
                            className={`inq-msg author-${m.author}`}
                          >
                            <div className="inq-msg-head">
                              <strong>
                                {m.author === 'support' ? m.name || 'תמיכה' : m.name || inq.name}
                              </strong>
                              <span>{m.author === 'support' ? 'תמיכה' : 'לקוח'}</span>
                              <time dateTime={m.at}>
                                {new Date(m.at).toLocaleString('he-IL')}
                              </time>
                            </div>
                            <p>{m.text}</p>
                          </li>
                        ))}
                      </ul>

                      {inq.status !== 'done' || canManage ? (
                        <div className="inq-reply-box">
                          <label>
                            {mode === 'agency' ? 'תשובה ללקוח' : 'הודעה נוספת לתמיכה'}
                            <textarea
                              value={replyDrafts[inq.id] || ''}
                              onChange={(e) =>
                                setReplyDrafts((d) => ({ ...d, [inq.id]: e.target.value }))
                              }
                              rows={3}
                              maxLength={4000}
                              placeholder={
                                mode === 'agency'
                                  ? 'כתבו את התשובה כאן — הלקוח יראה אותה במערכת…'
                                  : 'שאלה נוספת או עדכון…'
                              }
                            />
                          </label>
                          <div className="inq-item-actions">
                            <button
                              type="button"
                              className="btn primary"
                              disabled={busyId === inq.id || !(replyDrafts[inq.id] || '').trim()}
                              onClick={() => void onReply(inq)}
                            >
                              {busyId === inq.id ? 'שולח…' : 'שלחו במערכת'}
                            </button>
                            {canManage ? (
                              <>
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
                                    className="btn ghost"
                                    disabled={busyId === inq.id}
                                    onClick={() => void onStatus(inq.id, 'done')}
                                  >
                                    סמן כטופל
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
                              </>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
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
