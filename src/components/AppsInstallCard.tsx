import { useEffect, useState } from 'react';
import { cloudUrl } from '../lib/apiOrigin';
import { useI18n } from '../i18n';

type DownloadItem = {
  id: string;
  available: boolean;
  titleHe?: string;
  titleEn?: string;
  kind?: string;
  autoStart?: boolean;
  offline?: boolean;
  url?: string | null;
  fileName?: string;
  size?: number | null;
  version?: string;
};

type Catalog = {
  at?: string;
  items: DownloadItem[];
};

function formatBytes(n?: number | null) {
  if (!n || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveHref(url?: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return cloudUrl(url);
}

export function AppsInstallCard() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(cloudUrl('/api/downloads'), { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Catalog;
        if (!cancelled) setItems(Array.isArray(data.items) ? data.items : []);
      } catch {
        if (!cancelled) {
          setError(t('admin.appsLoadError'));
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <section className="card wide apps-install-card">
      <h2>{t('admin.appsTitle')}</h2>
      <p className="hint">{t('admin.appsHint')}</p>
      <ul className="apps-install-features">
        <li>{t('admin.appsFeatureOffline')}</li>
        <li>{t('admin.appsFeatureAutoStart')}</li>
        <li>{t('admin.appsFeatureSync')}</li>
      </ul>

      {loading ? <p className="hint">{t('admin.appsLoading')}</p> : null}
      {error ? <p className="hint warn">{error}</p> : null}

      <div className="apps-install-grid">
        {items.map((item) => {
          const title =
            locale === 'en'
              ? item.titleEn || item.titleHe || item.id
              : item.titleHe || item.titleEn || item.id;
          const href = resolveHref(item.url);
          const ready = item.available && Boolean(href);
          const meta = [
            item.version ? `v${item.version}` : null,
            formatBytes(item.size),
            item.autoStart ? t('admin.appsBadgeAutoStart') : null,
            item.offline ? t('admin.appsBadgeOffline') : null,
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <article key={item.id} className={`apps-install-item${ready ? '' : ' is-missing'}`}>
              <div className="apps-install-item-body">
                <strong>{title}</strong>
                {meta ? <em>{meta}</em> : null}
                {!ready ? <span className="apps-install-missing">{t('admin.appsUnavailable')}</span> : null}
              </div>
              {ready ? (
                <a className="btn primary" href={href!} download>
                  {t('admin.appsDownload')}
                </a>
              ) : (
                <button type="button" className="btn ghost" disabled>
                  {t('admin.appsDownload')}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
