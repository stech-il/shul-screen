import { useEffect, useMemo, useState } from 'react';
import {
  deleteDiskFile,
  deleteDiskFolder,
  fetchDiskInventory,
  formatBytes,
  type DiskFileGroup,
  type DiskInventory,
} from '../lib/diskFiles';
import './DiskFilesPanel.css';

function isImageName(name: string): boolean {
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
}

export function DiskFilesPanel() {
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
    if (!confirm(`למחוק את הקובץ «${name}» מהדיסק?\nפעולה זו אינה הפיכה.`)) return;
    setBusy(relative);
    setMsg('');
    try {
      await deleteDiskFile(relative);
      setMsg(`נמחק: ${name}`);
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
      !confirm(
        `למחוק את כל ${group.files.length} הקבצים בתיקייה «${group.kind}/${group.synagogueId}»?\nסה״כ ${formatBytes(group.bytes)}.`,
      )
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
          <p className="hint">
            כל הקבצים השמורים בדיסק השרת (מדיה, גיבויים, פניות ועוד). אפשר למחוק קבצים שלא צריך
            יותר.
          </p>
        </div>
        <button type="button" className="btn ghost" disabled={loading} onClick={() => void reload()}>
          {loading ? 'טוען…' : 'רענן'}
        </button>
      </div>

      {data ? (
        <p className="disk-files-summary">
          <strong>{data.totalFiles}</strong> קבצים · <strong>{formatBytes(data.totalBytes)}</strong>
          {data.dataDirSet ? ' · דיסק קבוע פעיל' : ' · ללא DATA_DIR (אחסון זמני)'}
        </p>
      ) : null}

      <div className="disk-files-tools">
        <label>
          סוג
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="all">הכל</option>
            {(data?.kinds || []).map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
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
          return (
            <li key={key} className={`disk-group ${open ? 'is-open' : ''}`}>
              <div className="disk-group-bar">
                <button
                  type="button"
                  className="disk-group-toggle"
                  onClick={() => setOpenKey(open ? null : key)}
                >
                  <strong>{g.label}</strong>
                  <span>
                    {g.files.length} קבצים · {formatBytes(g.bytes)}
                  </span>
                </button>
                {g.synagogueId && (g.kind === 'media' || g.kind === 'backups') ? (
                  <button
                    type="button"
                    className="btn ghost danger-btn"
                    disabled={busy !== null}
                    onClick={() => void onDeleteFolder(g)}
                  >
                    מחק תיקייה
                  </button>
                ) : null}
              </div>
              {open ? (
                <ul className="disk-file-list">
                  {g.files.map((f) => (
                    <li key={f.id}>
                      <div className="disk-file-main">
                        {f.url && isImageName(f.name) ? (
                          <img src={f.url} alt="" className="disk-thumb" loading="lazy" />
                        ) : (
                          <span className="disk-file-icon" aria-hidden />
                        )}
                        <div>
                          <p className="disk-file-name" dir="ltr">
                            {f.url ? (
                              <a href={f.url} target="_blank" rel="noreferrer">
                                {f.name}
                              </a>
                            ) : (
                              f.name
                            )}
                          </p>
                          <p className="disk-file-meta">
                            {formatBytes(f.bytes)} ·{' '}
                            {new Date(f.mtime).toLocaleString('he-IL')}
                            {f.protected ? ' · מוגן' : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn ghost danger-btn"
                        disabled={Boolean(f.protected) || busy === f.relative}
                        onClick={() => void onDeleteFile(f.relative, f.name)}
                      >
                        {busy === f.relative ? 'מוחק…' : 'מחק'}
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
