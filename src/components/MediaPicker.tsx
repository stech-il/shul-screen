import { useEffect, useId, useRef, useState } from 'react';
import type { GalleryItem } from '../types';
import {
  createGalleryItem,
  guessMediaKind,
  removeFromGallery,
} from '../lib/gallery';
import { uploadMedia, fetchMediaUsage, formatMediaBytes, type MediaKind, type MediaUsage } from '../lib/media';
import { useI18n } from '../i18n';
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
  title,
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
  const { t, dir } = useI18n();
  const modalTitle = title ?? t('panels.pickMedia');
  const fileRef = useRef<HTMLInputElement>(null);
  const ignoreOverlayUntil = useRef(0);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [usage, setUsage] = useState<MediaUsage | null>(null);
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

  useEffect(() => {
    if (!open || !synagogueId) {
      setUsage(null);
      return;
    }
    let cancelled = false;
    void fetchMediaUsage(synagogueId)
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch(() => {
        if (!cancelled) setUsage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, synagogueId, gallery.length]);

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
      setError(t('media.pickImageNotVideo'));
      return;
    }
    if (kind === 'video' && file.type.startsWith('image/')) {
      setError(t('media.pickVideoNotImage'));
      return;
    }

    setUploading(true);
    setProgress(0);
    setProgressLabel(t('media.starting'));
    setError('');
    onStatus?.(t('media.uploadingGallery'));
    try {
      const r = await uploadMedia(synagogueId, file, detected, 'gallery', (pct, label) => {
        setProgress(pct);
        if (label) setProgressLabel(label);
      });
      setProgress(100);
      setProgressLabel(t('media.done'));
      const item = createGalleryItem(r.url, detected, file.name);
      const nextGallery = [item, ...gallery.filter((g) => g.url !== item.url)];
      onGalleryChange(nextGallery);
      if (!manageOnly) {
        onSelect(item.url);
      }
      const msg = r.remote
        ? t('media.uploadedRemote')
        : r.warning ?? t('media.addedLocal');
      onStatus?.(msg);
      void fetchMediaUsage(synagogueId)
        .then(setUsage)
        .catch(() => {});
      if (!manageOnly) {
        // short delay so user sees 100%
        await new Promise((res) => setTimeout(res, 280));
        onClose();
      } else {
        setError('');
        onStatus?.(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('media.uploadFail');
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
        dir={dir}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mg-head">
          <h2 id={titleId}>{modalTitle}</h2>
          <button
            type="button"
            className="mg-close"
            onClick={tryClose}
            aria-label={t('media.close')}
            disabled={uploading}
          >
            ×
          </button>
        </header>

        {usage ? (
          <div
            className={`mg-quota${usage.remainingBytes < 2 * 1024 * 1024 ? ' is-tight' : ''}`}
            role="status"
          >
            <div className="mg-quota-row">
              <span>{t('media.storageLabel')}</span>
              <strong>
                {formatMediaBytes(usage.usedBytes)} / {formatMediaBytes(usage.limitBytes)}
              </strong>
            </div>
            <div className="mg-quota-bar" aria-hidden="true">
              <span
                style={{
                  width: `${Math.min(100, (usage.usedBytes / Math.max(1, usage.limitBytes)) * 100)}%`,
                }}
              />
            </div>
            <p className="mg-quota-hint">{t('media.storageHint')}</p>
          </div>
        ) : null}

        <div className="mg-toolbar">
          <button
            type="button"
            className="btn primary"
            disabled={uploading}
            onClick={openFilePicker}
          >
            {uploading ? t('media.uploadBusy') : t('media.uploadNew')}
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
            placeholder={t('media.searchPh')}
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
              {t('media.clearSelection')}
            </button>
          ) : null}
        </div>

        {error ? <p className="mg-error">{error}</p> : null}

        {uploading ? (
          <div className="mg-progress-wrap" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="mg-progress-meta">
              <span>{progressLabel || t('media.uploading')}</span>
              <strong>{progress}%</strong>
            </div>
            <div className="mg-progress-track">
              <div className="mg-progress-bar" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}

        {items.length === 0 && !uploading ? (
          <p className="mg-empty">
            {t('media.empty')}
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
                    onStatus?.(t('media.selectedSave'));
                  }}
                >
                  {g.kind === 'video' ? (
                    <video src={g.url} muted preload="metadata" />
                  ) : (
                    <img src={g.url} alt={g.name} />
                  )}
                  <span className="mg-kind">{g.kind === 'video' ? t('media.video') : t('media.image')}</span>
                </button>
                <div className="mg-meta">
                  <span title={g.name}>{g.name}</span>
                  <button
                    type="button"
                    className="mg-del"
                    title={t('media.removeFromGallery')}
                    disabled={uploading}
                    onClick={() => onGalleryChange(removeFromGallery(gallery, g.id))}
                  >
                    {t('media.delete')}
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
  const { t } = useI18n();
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
          <div className="mg-field-preview empty">{t('media.noSelection')}</div>
        )}
        <div className="mg-field-actions">
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            {t('media.pickOrUpload')}
          </button>
          {value ? (
            <button type="button" className="btn ghost" onClick={() => onChange('')}>
              {t('media.clear')}
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
  const { t } = useI18n();
  return (
    <>
      <div className="mg-field-label">{t('panels.manageGallery', { n: gallery.length })}</div>
      <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
        {t('panels.openGallery')}
      </button>
      <MediaGalleryModal
        open={open}
        title={t('panels.mediaGallery')}
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
