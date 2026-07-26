export type InquiryTopic =
  | 'fault'
  | 'support'
  | 'content'
  | 'billing'
  | 'feature'
  | 'other'
  | 'general'
  | 'demo';

export type InquiryStatus = 'new' | 'read' | 'done';
export type InquiryAuthor = 'customer' | 'support';
export type InquiryAwaiting = 'customer' | 'support' | null;

export interface InquiryMessage {
  id: string;
  at: string;
  author: InquiryAuthor | string;
  name: string;
  text: string;
}

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
  messages?: InquiryMessage[];
  awaiting?: InquiryAwaiting;
  replyCount?: number;
}

export const INQUIRY_TOPIC_LABELS: Record<InquiryTopic, string> = {
  fault: 'תקלה במסך',
  support: 'תמיכה טכנית',
  content: 'תוכן / עיצוב',
  billing: 'תשלום / רישיון',
  feature: 'בקשת שיפור',
  other: 'אחר',
  general: 'פנייה כללית',
  demo: 'בקשת הדגמה',
};

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  new: 'חדשה',
  read: 'בטיפול',
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
}): Promise<{ ok: boolean; id: string; item?: Inquiry; mailConfigured?: boolean }> {
  const res = await fetch('/api/inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function fetchInquiries(opts?: {
  status?: InquiryStatus;
  synagogueId?: string;
}): Promise<{
  items: Inquiry[];
  unread: number;
  unreadCustomer: number;
  total: number;
}> {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.synagogueId) params.set('synagogueId', opts.synagogueId);
  const q = params.toString() ? `?${params}` : '';
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

export async function replyToInquiry(input: {
  id: string;
  text: string;
  author: InquiryAuthor;
  name?: string;
}): Promise<{ ok: boolean; item: Inquiry }> {
  const res = await fetch(`/api/inquiries/${encodeURIComponent(input.id)}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: input.text,
      author: input.author,
      name: input.name,
    }),
  });
  return parseJson(res);
}
