import { cloudUrl } from './apiOrigin';

export type PublicSynagogue = {
  id: string;
  name: string;
  logoUrl: string;
};

export async function fetchPublicSynagogues(): Promise<PublicSynagogue[]> {
  const res = await fetch(cloudUrl('/api/public/synagogues'), { cache: 'no-store' });
  if (!res.ok) throw new Error('failed to load public synagogues');
  const data = (await res.json()) as { items?: PublicSynagogue[] };
  return Array.isArray(data.items) ? data.items : [];
}
