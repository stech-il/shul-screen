import { useEffect, useId, useRef, useState } from 'react';
import type { GalleryItem } from '../types';
import {
  createGalleryItem,
  guessMediaKind,
  removeFromGallery,
} from '../lib/gallery';
import { uploadMedia, type MediaKind } from '../lib/media';
import './MediaPicker.css';

interface ModalProps {
  open: boolean;
  title?: string;
  synagogueId: string;
  gallery: GalleryItem[];
  kind: MediaKind | 'any';
  currentUrl?: string;
  /** when true, selecting an item only manages gallery (no field assign) */
  manageOnly?: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  onGalleryChange: (gallery: GalleryItem[]) => void;
  onStatus?: (msg: string) => void;
}

export function MediaGalleryModal({
  open,
  title = 'בחירה מהגלריה',
  synagogueId,
  gallery,
  kind,
  currentUrl,
  manageOnly = false,
  onClose,
  onSelect,
  onGalleryChange,
  onStatus,
}: ModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const ignoreOverlayUntil = useRef(0);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      setError('');
      setUploading(false);
      setProgress(0);
      setProgressLabel('');
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !uploading) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, uploading]);

  if (!open) return null;

  const accept =
    kind === 'video' ? 'video/*' : kind === 'image' ? 'image/*' : 'image/*,video/*';
  const uploadKind: MediaKind = kind === 'video' ? 'video' : 'image';

  const items = gallery.filter((g) => {
    if (kind === 'image' && g.kind !== 'image') return false;
    if (kind === 'video' && g.kind !== 'video') return false;
    if (filter.trim()) {
      return g.name.toLowerCase().includes(filter.trim().toLowerCase());
    }
    return true;
  });

  function openFilePicker() {
    setError('');
    // Native file dialog often fires a click on the overlay when it closes
    ignoreOverlayUntil.current = Date.now() + 1200;
    fileRef.current?.click();
  }

  function tryClose() {
    if (uploading) return;
    if (Date.now() < ignoreOverlayUntil.current) return;
    onClose();
  }

  async function onUpload(file: File) {
    ignoreOverlayUntil.current = Date.now() + 800;
    const detected: MediaKind =
      kind === 'any'
        ? file.type.startsWith('video/')
          ? 'video'
          : 'image'
        : file.type.startsWith('video/') && kind !== 'image'
          ? 'video'
          : uploadKind;

    if (kind === 'image' && file.type.startsWith('video/')) {
      setError('יש לבחור תמונה, לא סרטון');
      return;
    }
    if (kind === 'video' && file.type.startsWith('image/')) {
      setError('יש לבחור סרטון, לא תמונה');
      return;
    }

    setUploading(true);
    setProgress(0);
    setProgressLabel('מתחיל...');
    setError('');
    onStatus?.('מעלה לגלריה...');
    try {
      const r = await uploadMedia(synagogueId, file, detected, 'gallery', (pct, label) => {
        setProgress(pct);
        if (label) setProgressLabel(label);
      });
      setProgress(100);
      setProgressLabel('הושלם');
      const item = createGalleryItem(r.url, detected, file.name);
      const nextGallery = [item, ...gallery.filter((g) => g.url !== item.url)];
      onGalleryChange(nextGallery);
      if (!manageOnly) {
        onSelect(item.url);
      }
      const msg = r.remote
        ? 'הועלה לגלריה ולשרת — לחץ שמור'
        : r.warning ?? 'נוסף לגלריה — לחץ שמור';
      onStatus?.(msg);
      if (!manageOnly) {
        // short delay so user sees 100%
        await new Promise((res) => setTimeout(res, 280));
        onClose();
      } else {
        setError('');
        onStatus?.(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'העלאה נכשלה';
      setError(msg);
      onStatus?.(msg);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="mg-overlay" role="presentation" onClick={tryClose}>
      <div
        className="mg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mg-head">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="mg-close"
            onClick={tryClose}
            aria-label="סגור"
            disabled={uploading}
          >
            ×
          </button>
        </header>

        <div className="mg-toolbar">
          <button
            type="button"
            className="btn primary"
            disabled={uploading}
            onClick={openFilePicker}
          >
            {uploading ? 'מעלה... אנא המתן' : '+ העלה קובץ חדש לגלריה'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
          />
          <input
            className="mg-search"
            placeholder="חיפוש בגלריה..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={uploading}
          />
          {currentUrl && !manageOnly ? (
            <button
              type="button"
              className="btn ghost"
              disabled={uploading}
              onClick={() => {
                onSelect('');
                onClose();
              }}
            >
              נקה בחירה
            </button>
          ) : null}
        </div>

        {error ? <p className="mg-error">{error}</p> : null}

        {uploading ? (
          <div className="mg-progress-wrap" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="mg-progress-meta">
              <span>{progressLabel || 'מעלה...'}</span>
              <strong>{progress}%</strong>
            </div>
            <div className="mg-progress-track">
              <div className="mg-progress-bar" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}

        {items.length === 0 && !uploading ? (
          <p className="mg-empty">
            הגלריה ריקה. לחץ «העלה קובץ חדש לגלריה», בחר תמונה, ואז שמור בהגדרות.
          </p>
        ) : (
          <div className="mg-grid">
            {items.map((g) => (
              <div
                key={g.id}
                className={`mg-card ${currentUrl === g.url ? 'selected' : ''}`}
              >
                <button
                  type="button"
                  className="mg-thumb"
                  disabled={uploading}
                  onClick={() => {
                    if (manageOnly) return;
                    onSelect(g.url);
                    onClose();
                    onStatus?.('נבחר מהגלריה — לחץ שמור');
                  }}
                >
                  {g.kind === 'video' ? (
                    <video src={g.url} muted preload="metadata" />
                  ) : (
                    <img src={g.url} alt={g.name} />
                  )}
                  <span className="mg-kind">{g.kind === 'video' ? 'סרטון' : 'תמונה'}</span>
                </button>
                <div className="mg-meta">
                  <span title={g.name}>{g.name}</span>
                  <button
                    type="button"
                    className="mg-del"
                    title="הסר מהגלריה"
                    disabled={uploading}
                    onClick={() => onGalleryChange(removeFromGallery(gallery, g.id))}
                  >
                    מחק
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value?: string;
  synagogueId: string;
  gallery: GalleryItem[];
  kind?: MediaKind | 'any';
  onChange: (url: string) => void;
  onGalleryChange: (gallery: GalleryItem[]) => void;
  onStatus?: (msg: string) => void;
}

export function MediaPickerField({
  label,
  value,
  synagogueId,
  gallery,
  kind = 'image',
  onChange,
  onGalleryChange,
  onStatus,
}: FieldProps) {
  const [open, setOpen] = useState(false);
  const previewKind = value ? guessMediaKind(value, kind === 'video' ? 'video' : 'image') : null;

  return (
    <div className="mg-field">
      <div className="mg-field-label">{label}</div>
      <div className="mg-field-row">
        {value ? (
          <div className="mg-field-preview">
            {previewKind === 'video' ? (
              <video src={value} muted playsInline />
            ) : (
              <img src={value} alt="" />
            )}
          </div>
        ) : (
          <div className="mg-field-preview empty">אין בחירה</div>
        )}
        <div className="mg-field-actions">
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            בחר מהגלריה / העלה
          </button>
          {value ? (
            <button type="button" className="btn ghost" onClick={() => onChange('')}>
              נקה
            </button>
          ) : null}
        </div>
      </div>
      <MediaGalleryModal
        open={open}
        title={label}
        synagogueId={synagogueId}
        gallery={gallery}
        kind={kind}
        currentUrl={value}
        onClose={() => setOpen(false)}
        onSelect={onChange}
        onGalleryChange={onGalleryChange}
        onStatus={onStatus}
      />
    </div>
  );
}

/** Standalone gallery manager (upload / delete without assigning a field) */
export function GalleryManager({
  synagogueId,
  gallery,
  onGalleryChange,
  onStatus,
}: {
  synagogueId: string;
  gallery: GalleryItem[];
  onGalleryChange: (gallery: GalleryItem[]) => void;
  onStatus?: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mg-field-label">ניהול גלריה ({gallery.length} קבצים)</div>
      <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
        פתח גלריה
      </button>
      <MediaGalleryModal
        open={open}
        title="גלריית מדיה"
        synagogueId={synagogueId}
        gallery={gallery}
        kind="any"
        manageOnly
        onClose={() => setOpen(false)}
        onSelect={() => {
          /* manage only */
        }}
        onGalleryChange={onGalleryChange}
        onStatus={onStatus}
      />
    </>
  );
}
