import { useEffect, useMemo, useState } from 'react';
import {
  deleteDiskFile,
  deleteDiskFolder,
  fetchDiskInventory,
  formatBytes,
  type DiskFileGroup,
  type DiskInventory,
} from '../lib/diskFiles';
import { useAppNotice } from './AppNotice';
import './DiskFilesPanel.css';

const KIND_SHORT: Record<string, string> = {
  media: 'מדיה',
  backups: 'גיבויים',
  synagogues: 'הגדרות',
  billing: 'חיוב',
  inquiries: 'פניות',
  heartbeats: 'סטטוס',
  templates: 'תבניות',
  'notify-log': 'יומן מייל',
};

function isImageName(name: string): boolean {
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
}

function shortName(name: string, max = 36): string {
  if (name.length <= max) return name;
  const extMatch = name.match(/(\.[a-z0-9]{1,8})$/i);
  const ext = extMatch?.[1] || '';
  const base = ext ? name.slice(0, -ext.length) : name;
  const keep = Math.max(8, max - ext.length - 1);
  return `${base.slice(0, keep)}…${ext}`;
}

function kindLabel(kind: string): string {
  return KIND_SHORT[kind] || kind;
}

export function DiskFilesPanel() {
  const { confirm: askConfirm } = useAppNotice();
  const [data, setData] = useState<DiskInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  async function reload() {
    setLoading(true);
    setError('');
    try {
      const inv = await fetchDiskInventory();
      setData(inv);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'טעינת הדיסק נכשלה');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const groups = useMemo(() => {
    if (!data) return [] as DiskFileGroup[];
    const q = query.trim().toLowerCase();
    return data.groups
      .filter((g) => (kindFilter === 'all' ? true : g.kind === kindFilter))
      .map((g) => ({
        ...g,
        files: q
          ? g.files.filter(
              (f) =>
                f.name.toLowerCase().includes(q) ||
                f.synagogueId.toLowerCase().includes(q) ||
                f.relative.toLowerCase().includes(q),
            )
          : g.files,
      }))
      .filter((g) => g.files.length > 0);
  }, [data, kindFilter, query]);

  async function onDeleteFile(relative: string, name: string) {
    if (
      !(await askConfirm({
        message: `למחוק את הקובץ «${name}» מהדיסק?\nפעולה זו אינה הפיכה.`,
        confirmLabel: 'מחק',
        danger: true,
      }))
    ) {
      return;
    }
    setBusy(relative);
    setMsg('');
    try {
      await deleteDiskFile(relative);
      setMsg(`נמחק: ${shortName(name, 40)}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'מחיקה נכשלה');
    } finally {
      setBusy(null);
    }
  }

  async function onDeleteFolder(group: DiskFileGroup) {
    if (!group.synagogueId) return;
    if (
      !(await askConfirm({
        message: `למחוק את כל ${group.files.length} הקבצים בתיקייה «${group.kind}/${group.synagogueId}»?\nסה״כ ${formatBytes(group.bytes)}.`,
        confirmLabel: 'מחק הכל',
        danger: true,
      }))
    ) {
      return;
    }
    setBusy(`folder:${group.kind}:${group.synagogueId}`);
    setMsg('');
    try {
      const r = await deleteDiskFolder(group.kind, group.synagogueId);
      setMsg(`נמחקו ${r.removed} קבצים (${formatBytes(r.bytes)})`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'מחיקת תיקייה נכשלה');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="disk-files side-card">
      <div className="disk-files-head">
        <div>
          <h2>ניהול קבצים בדיסק</h2>
          <p className="hint">מדיה, גיבויים וקבצי מערכת — מחקו מה שלא צריך.</p>
        </div>
        <button type="button" className="btn ghost" disabled={loading} onClick={() => void reload()}>
          {loading ? 'טוען…' : 'רענן'}
        </button>
      </div>

      {data ? (
        <div className="disk-files-summary" role="status">
          <span>
            <strong>{data.totalFiles}</strong> קבצים
          </span>
          <span>
            <strong>{formatBytes(data.totalBytes)}</strong>
          </span>
          <span className={data.dataDirSet ? 'ok' : 'warn'}>
            {data.dataDirSet ? 'דיסק קבוע' : 'אחסון זמני'}
          </span>
        </div>
      ) : null}

      <div className="disk-files-tools">
        <label>
          סוג
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="all">הכל</option>
            {(data?.kinds || []).map((k) => (
              <option key={k.kind} value={k.kind}>
                {KIND_SHORT[k.kind] || k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="disk-files-search">
          חיפוש
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="שם קובץ / בית כנסת…"
          />
        </label>
      </div>

      {error ? <p className="hint warn">{error}</p> : null}
      {msg ? <p className="hint ok-msg">{msg}</p> : null}
      {loading && !data ? <p className="hint">טוען רשימת קבצים…</p> : null}
      {!loading && groups.length === 0 ? <p className="hint">אין קבצים להצגה.</p> : null}

      <ul className="disk-group-list">
        {groups.map((g) => {
          const key = `${g.kind}:${g.synagogueId || g.label}`;
          const open = openKey === key;
          const title = g.synagogueId || kindLabel(g.kind);
          return (
            <li key={key} className={`disk-group ${open ? 'is-open' : ''}`}>
              <div className="disk-group-bar">
                <button
                  type="button"
                  className="disk-group-toggle"
                  onClick={() => setOpenKey(open ? null : key)}
                  aria-expanded={open}
                >
                  <span className="disk-kind-chip">{kindLabel(g.kind)}</span>
                  <span className="disk-group-title" dir={g.synagogueId ? 'ltr' : undefined}>
                    {title}
                  </span>
                  <span className="disk-group-meta">
                    {g.files.length} קבצים · {formatBytes(g.bytes)}
                    {open ? ' · סגור' : ' · פתח'}
                  </span>
                </button>
                {g.synagogueId && (g.kind === 'media' || g.kind === 'backups') ? (
                  <button
                    type="button"
                    className="btn ghost danger-btn disk-folder-del"
                    disabled={busy !== null}
                    onClick={() => void onDeleteFolder(g)}
                  >
                    מחק הכל
                  </button>
                ) : null}
              </div>
              {open ? (
                <ul className="disk-file-list">
                  {g.files.map((f) => (
                    <li key={f.id} className="disk-file-row">
                      <div className="disk-file-main">
                        {f.url && isImageName(f.name) ? (
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            className="disk-thumb-link"
                            title="פתח תמונה"
                          >
                            <img src={f.url} alt="" className="disk-thumb" loading="lazy" />
                          </a>
                        ) : (
                          <span className="disk-file-icon" aria-hidden />
                        )}
                        <div className="disk-file-text">
                          <p className="disk-file-name" dir="ltr" title={f.name}>
                            {f.url ? (
                              <a href={f.url} target="_blank" rel="noreferrer">
                                {shortName(f.name)}
                              </a>
                            ) : (
                              shortName(f.name)
                            )}
                          </p>
                          <p className="disk-file-meta">
                            {formatBytes(f.bytes)} ·{' '}
                            {new Date(f.mtime).toLocaleDateString('he-IL')}
                            {f.protected ? ' · מוגן' : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn ghost danger-btn disk-file-del"
                        disabled={Boolean(f.protected) || busy === f.relative}
                        onClick={() => void onDeleteFile(f.relative, f.name)}
                      >
                        {busy === f.relative ? '…' : 'מחק'}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
