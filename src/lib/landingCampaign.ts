/** Seasonal landing promo — Bein HaZmanim / Elul (חודש הרחמים והסליחות). */
export const LANDING_CAMPAIGN = {
  /** Inclusive end (Israel evening, end of September 2026 / after Elul season). */
  endsAt: '2026-09-30T21:59:59+03:00',
  regularPrice: 99,
  salePrice: 79,
} as const;

export function isLandingCampaignActive(now = Date.now()): boolean {
  const end = Date.parse(LANDING_CAMPAIGN.endsAt);
  return Number.isFinite(end) && now <= end;
}

export function campaignWhatsAppUrl(locale: 'he' | 'en' = 'he'): string {
  const text =
    locale === 'he'
      ? `שלום, מעוניין במבצע חודש הרחמים והסליחות — מסך screensmart ב־${LANDING_CAMPAIGN.salePrice} ₪ לחודש`
      : `Hi, I'm interested in the Elul promo — screensmart at ${LANDING_CAMPAIGN.salePrice} ILS/month`;
  return `https://wa.me/972524521527?text=${encodeURIComponent(text)}`;
}
