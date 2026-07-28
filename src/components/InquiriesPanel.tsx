import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import {
  fetchInquiries,
  INQUIRY_MAX_ATTACHMENTS,
  inquiryAttachAccept,
  replyToInquiry,
  submitInquiry,
  updateInquiryStatus,
  uploadInquiryAttachment,
  type Inquiry,
  type InquiryAttachment,
  type InquiryStatus,
  type InquiryTopic,
} from '../lib/inquiries';
import './InquiriesPanel.css';

const TOPIC_KEYS: Record<InquiryTopic, string> = {
  fault: 'inquiries.topicFault',
  support: 'inquiries.topicSupport',
  content: 'inquiries.topicContent',
  custom_design: 'inquiries.topicCustomDesign',
  billing: 'inquiries.topicBilling',
  feature: 'inquiries.topicFeature',
  other: 'inquiries.topicOther',
  general: 'inquiries.topicGeneral',
  demo: 'inquiries.topicDemo',
};

const STATUS_KEYS: Record<InquiryStatus, string> = {
  new: 'inquiries.statusNew',
  read: 'inquiries.statusRead',
  done: 'inquiries.statusDone',
};

type Mode = 'admin' | 'agency';

interface Props {
  mode: Mode;
  synagogueId?: string;
  synagogueName?: string;
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
  canManage?: boolean;
  initialTopic?: InquiryTopic | null;
  onPrefillConsumed?: () => void;
}

function AttachmentList({
  items,
  onRemove,
}: {
  items: InquiryAttachment[];
  onRemove?: (id: string) => void;
}) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <ul className="inq-attach-list">
      {items.map((a) => (
        <li key={a.id}>
          <a href={a.url} target="_blank" rel="noreferrer">
            {a.name}
          </a>
          {onRemove ? (
            <button type="button" className="inq-attach-remove" onClick={() => onRemove(a.id)}>
              {t('inquiries.remove')}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function InquiriesPanel({
  mode,
  synagogueId = '',
  synagogueName: _synagogueName = '',
  defaultName = '',
  defaultEmail = '',
  defaultPhone = '',
  canManage = mode === 'agency',
  initialTopic = null,
  onPrefillConsumed,
}: Props) {
  const { t, dateTag } = useI18n();
  const [items, setItems] = useState<Inquiry[]>([]);
  const [unread, setUnread] = useState(0);
  const [unreadCustomer, setUnreadCustomer] = useState(0);
  const [filter, setFilter] = useState<'all' | InquiryStatus>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyAttachments, setReplyAttachments] = useState<Record<string, InquiryAttachment[]>>(
    {},
  );
  const [replyUploading, setReplyUploading] = useState<string | null>(null);

  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);
  const [topic, setTopic] = useState<InquiryTopic>('fault');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<InquiryAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [formMsg, setFormMsg] = useState('');

  useEffect(() => {
    setName(defaultName);
    setEmail(defaultEmail);
    setPhone(defaultPhone);
  }, [defaultName, defaultEmail, defaultPhone]);

  useEffect(() => {
    if (!initialTopic) return;
    setTopic(initialTopic);
    if (initialTopic === 'custom_design') {
      setMessage((prev) =>
        prev.trim()
          ? prev
          : t('inquiries.prefillDesign'),
      );
    }
    onPrefillConsumed?.();
    queueMicrotask(() => {
      document.getElementById('inq-compose')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [initialTopic, onPrefillConsumed]);

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
      setError(err instanceof Error ? err.message : t('inquiries.loadFail'));
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

  async function addComposeFiles(files: FileList | null) {
    if (!files?.length || !synagogueId) return;
    setUploading(true);
    setFormMsg('');
    try {
      const next = [...attachments];
      for (const file of Array.from(files)) {
        if (next.length >= INQUIRY_MAX_ATTACHMENTS) break;
        next.push(await uploadInquiryAttachment(synagogueId, file));
      }
      setAttachments(next);
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : t('inquiries.uploadFail'));
    } finally {
      setUploading(false);
    }
  }

  async function addReplyFilesForSynagogue(
    inqId: string,
    sid: string,
    files: FileList | null,
  ) {
    if (!files?.length || !sid) return;
    setReplyUploading(inqId);
    setError('');
    try {
      const current = replyAttachments[inqId] || [];
      const next = [...current];
      for (const file of Array.from(files)) {
        if (next.length >= INQUIRY_MAX_ATTACHMENTS) break;
        next.push(await uploadInquiryAttachment(sid, file));
      }
      setReplyAttachments((d) => ({ ...d, [inqId]: next }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('inquiries.uploadFail'));
    } finally {
      setReplyUploading(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!synagogueId) {
      setFormMsg(t('inquiries.missingShul'));
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
        attachments,
      });
      setMessage('');
      setAttachments([]);
      setTopic('fault');
      setFormMsg(t('inquiries.sentOk'));
      await reload();
      if (result.id) setOpenId(result.id);
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : t('inquiries.sendFail'));
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
      setError(err instanceof Error ? err.message : t('inquiries.updateFail'));
    } finally {
      setBusyId(null);
    }
  }

  async function onReply(inq: Inquiry) {
    const text = (replyDrafts[inq.id] || '').trim();
    const files = replyAttachments[inq.id] || [];
    if (!text && !files.length) return;
    setBusyId(inq.id);
    try {
      const author = mode === 'agency' ? 'support' : 'customer';
      const replyName =
        mode === 'agency' ? t('inquiries.supportName') : name || defaultName || inq.name;
      await replyToInquiry({
        id: inq.id,
        text,
        author,
        name: replyName,
        attachments: files,
      });
      setReplyDrafts((d) => ({ ...d, [inq.id]: '' }));
      setReplyAttachments((d) => ({ ...d, [inq.id]: [] }));
      await reload();
      setOpenId(inq.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('inquiries.replyFail'));
    } finally {
      setBusyId(null);
    }
  }

  const topicOptions = (Object.keys(TOPIC_KEYS) as InquiryTopic[]).filter((id) =>
    mode === 'admin'
      ? ['fault', 'support', 'content', 'custom_design', 'billing', 'feature', 'other'].includes(id)
      : true,
  );

  const badgeCount = mode === 'agency' ? unread : unreadCustomer;
  const attachSid = (inq: Inquiry) => synagogueId || inq.synagogueId;

  return (
    <div className={`inq-panel mode-${mode}`}>
      {mode === 'admin' ? (
        <section className="inq-compose card" id="inq-compose">
          <h2>{t('panels.inquiriesOpen')}</h2>
          <form className="inq-form" onSubmit={(e) => void onSubmit(e)}>
            <div className="inq-form-grid">
              <label>
                {t('inquiries.name')}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
              <label>
                {t('inquiries.emailNotify')}
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
                {t('inquiries.phone')}
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  style={{ textAlign: 'left' }}
                />
              </label>
              <label>
                {t('inquiries.topic')}
                <select value={topic} onChange={(e) => setTopic(e.target.value as InquiryTopic)}>
                  {topicOptions.map((id) => (
                    <option key={id} value={id}>
                      {t(TOPIC_KEYS[id])}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {t('inquiries.details')}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                minLength={5}
                maxLength={4000}
                rows={5}
                placeholder={
                  topic === 'custom_design'
                    ? t('inquiries.placeholderDesign')
                    : t('inquiries.placeholderDefault')
                }
              />
            </label>
            <div className="inq-attach-field">
              <label className="inq-attach-label">
                {t('inquiries.attachFiles')}
                <input
                  type="file"
                  multiple
                  accept={inquiryAttachAccept()}
                  disabled={uploading || attachments.length >= INQUIRY_MAX_ATTACHMENTS}
                  onChange={(e) => {
                    void addComposeFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <p className="hint">
                {t('inquiries.attachHint', { n: INQUIRY_MAX_ATTACHMENTS })}
                {uploading ? t('inquiries.uploading') : ''}
              </p>
              <AttachmentList
                items={attachments}
                onRemove={(id) => setAttachments((list) => list.filter((a) => a.id !== id))}
              />
            </div>
            <div className="inq-form-actions">
              <button type="submit" className="btn primary" disabled={sending || uploading}>
                {sending ? t('panels.inquiriesSending') : t('panels.inquiriesSend')}
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
              {mode === 'agency' ? t('panels.inquiriesAgencyInbox') : t('panels.inquiriesInbox')}
              {badgeCount > 0 ? (
                <span className="inq-badge">
                  {badgeCount} {mode === 'agency' ? t('inquiries.badgeWaiting') : t('inquiries.badgeNewReplies')}
                </span>
              ) : null}
            </h2>
            <p className="hint">
              {mode === 'agency' ? t('inquiries.hintAgency') : t('inquiries.hintAdmin')}
            </p>
          </div>
          <div className="inq-inbox-tools">
            <div className="inq-filters" role="group" aria-label={t('inquiries.filterAria')}>
              {(
                [
                  ['all', 'inquiries.filterAll'],
                  ['new', 'inquiries.filterNew'],
                  ['read', 'inquiries.filterRead'],
                  ['done', 'inquiries.filterDone'],
                ] as const
              ).map(([id, labelKey]) => (
                <button
                  key={id}
                  type="button"
                  className={filter === id ? 'on' : ''}
                  onClick={() => setFilter(id)}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
            <button type="button" className="btn ghost" onClick={() => void reload()}>
              {t('inquiries.refresh')}
            </button>
          </div>
        </div>

        {error ? <p className="hint warn">{error}</p> : null}
        {loading && items.length === 0 ? <p className="hint">{t('inquiries.loading')}</p> : null}
        {!loading && visible.length === 0 ? (
          <p className="hint">{mode === 'admin' ? t('panels.inquiriesEmptyAdmin') : t('panels.inquiriesEmptyAgency')}</p>
        ) : (
          <ul className="inq-list">
            {visible.map((inq) => {
              const topicKey = TOPIC_KEYS[inq.topic as InquiryTopic];
              const topicLabel = topicKey ? t(topicKey) : inq.topic;
              const statusKey = STATUS_KEYS[inq.status as InquiryStatus];
              const statusLabel = statusKey ? t(statusKey) : inq.status;
              const open = openId === inq.id;
              const messages = inq.messages?.length
                ? inq.messages
                : [
                    {
                      id: 'legacy',
                      at: inq.createdAt,
                      author: 'customer' as const,
                      name: inq.name,
                      text: inq.message,
                      attachments: inq.attachments,
                    },
                  ];
              const waitingForMe =
                (mode === 'agency' && inq.awaiting === 'support') ||
                (mode === 'admin' && inq.awaiting === 'customer');
              const draftFiles = replyAttachments[inq.id] || [];
              const sid = attachSid(inq);

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
                      {waitingForMe ? <span className="inq-await">{t('inquiries.awaitingReply')}</span> : null}
                      <time dateTime={inq.updatedAt || inq.createdAt}>
                        {new Date(inq.updatedAt || inq.createdAt).toLocaleString(dateTag)}
                      </time>
                    </div>
                    <p className="inq-preview">
                      {messages[messages.length - 1]?.text?.slice(0, 120)}
                      {(messages[messages.length - 1]?.text?.length || 0) > 120 ? '…' : ''}
                    </p>
                    <span className="inq-thread-toggle">
                      {open ? t('inquiries.closeThread') : t('inquiries.openThread', { n: messages.length })}
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
                          ? ` · ${t('inquiries.synagogue', { id: inq.synagogueId })}`
                          : null}
                      </p>

                      <ul className="inq-messages">
                        {messages.map((m) => (
                          <li key={m.id} className={`inq-msg author-${m.author}`}>
                            <div className="inq-msg-head">
                              <strong>
                                {m.author === 'support' ? m.name || t('inquiries.support') : m.name || inq.name}
                              </strong>
                              <span>{m.author === 'support' ? t('inquiries.support') : t('inquiries.customer')}</span>
                              <time dateTime={m.at}>
                                {new Date(m.at).toLocaleString(dateTag)}
                              </time>
                            </div>
                            <p>{m.text}</p>
                            <AttachmentList items={m.attachments || []} />
                          </li>
                        ))}
                      </ul>

                      {inq.status !== 'done' || canManage ? (
                        <div className="inq-reply-box">
                          <label>
                            {mode === 'agency' ? t('inquiries.replyAgency') : t('inquiries.replyAdmin')}
                            <textarea
                              value={replyDrafts[inq.id] || ''}
                              onChange={(e) =>
                                setReplyDrafts((d) => ({ ...d, [inq.id]: e.target.value }))
                              }
                              rows={3}
                              maxLength={4000}
                              placeholder={
                                mode === 'agency'
                                  ? t('inquiries.replyPhAgency')
                                  : t('inquiries.replyPhAdmin')
                              }
                            />
                          </label>
                          <div className="inq-attach-field">
                            <label className="inq-attach-label">
                              {t('inquiries.attachFiles')}
                              <input
                                type="file"
                                multiple
                                accept={inquiryAttachAccept()}
                                disabled={
                                  !sid ||
                                  replyUploading === inq.id ||
                                  draftFiles.length >= INQUIRY_MAX_ATTACHMENTS
                                }
                                onChange={(e) => {
                                  void addReplyFilesForSynagogue(inq.id, sid, e.target.files);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            {replyUploading === inq.id ? (
                              <p className="hint">{t('inquiries.uploadingFiles')}</p>
                            ) : null}
                            <AttachmentList
                              items={draftFiles}
                              onRemove={(id) =>
                                setReplyAttachments((d) => ({
                                  ...d,
                                  [inq.id]: (d[inq.id] || []).filter((a) => a.id !== id),
                                }))
                              }
                            />
                          </div>
                          <div className="inq-item-actions">
                            <button
                              type="button"
                              className="btn primary"
                              disabled={
                                busyId === inq.id ||
                                replyUploading === inq.id ||
                                (!(replyDrafts[inq.id] || '').trim() && !draftFiles.length)
                              }
                              onClick={() => void onReply(inq)}
                            >
                              {busyId === inq.id ? t('inquiries.sending') : t('inquiries.sendInSystem')}
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
                                    {t('inquiries.markInProgress')}
                                  </button>
                                ) : null}
                                {inq.status !== 'done' ? (
                                  <button
                                    type="button"
                                    className="btn ghost"
                                    disabled={busyId === inq.id}
                                    onClick={() => void onStatus(inq.id, 'done')}
                                  >
                                    {t('inquiries.markDone')}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn ghost"
                                    disabled={busyId === inq.id}
                                    onClick={() => void onStatus(inq.id, 'read')}
                                  >
                                    {t('inquiries.reopen')}
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
