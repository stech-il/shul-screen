import { BrandLogo } from './BrandLogo';

/** Persistent credit / support line at the bottom of management screens. */
export function SiteFooter() {
  return (
    <footer className="site-footer" dir="rtl" lang="he">
      <p>
        <BrandLogo size="sm" className="site-footer-logo" />
        <span>
          {`נבנה ע\u05F4י screensmart 2026 · לתמיכה חייג `}
          <a href="tel:0524521527" dir="ltr">
            052-4521527
          </a>
        </span>
      </p>
    </footer>
  );
}
