export type InquiryTopic = 'general' | 'demo' | 'support' | 'billing' | 'other';
export type InquiryStatus = 'new' | 'read' | 'done';

export interface Inquiry {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  email: string;
  phone: string;
  topic: InquiryTopic | string;
  message: string;
  synagogueId: string;
  status: InquiryStatus | string;
  source: string;
}

export const INQUIRY_TOPIC_LABELS: Record<InquiryTopic, string> = {
  general: 'פנייה כללית',
  demo: 'בקשת הדגמה',
  support: 'תמיכה טכנית',
  billing: 'תשלום / רישיון',
  other: 'אחר',
};

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  new: 'חדשה',
  read: 'נקראה',
  done: 'טופלה',
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `שגיאה ${res.status}`);
  }
  return data;
}

export async function submitInquiry(input: {
  name: string;
  email: string;
  phone?: string;
  message: string;
  topic?: InquiryTopic;
  synagogueId?: string;
  source?: string;
}): Promise<{ ok: boolean; id: string; mailConfigured?: boolean }> {
  const res = await fetch('/api/inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function fetchInquiries(status?: InquiryStatus): Promise<{
  items: Inquiry[];
  unread: number;
  total: number;
}> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`/api/inquiries${q}`, { cache: 'no-store' });
  return parseJson(res);
}

export async function updateInquiryStatus(
  id: string,
  status: InquiryStatus,
): Promise<{ ok: boolean; item: Inquiry }> {
  const res = await fetch(`/api/inquiries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return parseJson(res);
}
