export type InquiryTopic =
  | 'fault'
  | 'support'
  | 'content'
  | 'custom_design'
  | 'billing'
  | 'feature'
  | 'other'
  | 'general'
  | 'demo';

export type InquiryStatus = 'new' | 'read' | 'done';
export type InquiryAuthor = 'customer' | 'support';
export type InquiryAwaiting = 'customer' | 'support' | null;

export interface InquiryAttachment {
  id: string;
  name: string;
  url: string;
  contentType?: string;
  size?: number;
}

export interface InquiryMessage {
  id: string;
  at: string;
  author: InquiryAuthor | string;
  name: string;
  text: string;
  attachments?: InquiryAttachment[];
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
  attachments?: InquiryAttachment[];
  awaiting?: InquiryAwaiting;
  replyCount?: number;
  unreadForCustomer?: number;
  unreadForSupport?: number;
}

export const INQUIRY_TOPIC_LABELS: Record<InquiryTopic, string> = {
  fault: 'תקלה במסך',
  support: 'תמיכה טכנית',
  content: 'תוכן / עיצוב',
  custom_design: 'עיצוב מיוחד',
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

export const INQUIRY_MAX_ATTACHMENTS = 5;
export const INQUIRY_MAX_FILE_BYTES = 8 * 1024 * 1024;

const ATTACH_ACCEPT =
  'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt';

export function inquiryAttachAccept(): string {
  return ATTACH_ACCEPT;
}

function safeFileName(name: string): string {
  return (
    name
      .replace(/[^\w.\u0590-\u05FF-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 80) || 'file'
  );
}

function assertAttachable(file: File): void {
  if (!file || file.size <= 0) throw new Error('הקובץ ריק או לא נבחר');
  if (file.size > INQUIRY_MAX_FILE_BYTES) {
    throw new Error('הקובץ גדול מדי (עד 8MB)');
  }
}

async function fileToBase64(file: File): Promise<{ contentType: string; dataBase64: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    contentType: file.type || 'application/octet-stream',
    dataBase64: btoa(binary),
  };
}

/** Upload an inquiry attachment to durable cloud media for the synagogue. */
export async function uploadInquiryAttachment(
  synagogueId: string,
  file: File,
): Promise<InquiryAttachment> {
  assertAttachable(file);
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().slice(0, 12);
  const base = safeFileName(file.name.replace(/\.[^.]+$/, '')) || 'file';
  const fileName = `inquiries-${Date.now()}-${base}.${ext}`;
  const { contentType, dataBase64 } = await fileToBase64(file);
  const res = await fetch(`/api/cloud/media/${encodeURIComponent(synagogueId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, contentType, dataBase64 }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
    fileName?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'העלאת הקובץ נכשלה');
  }
  return {
    id: `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: file.name.slice(0, 160) || fileName,
    url: data.url,
    contentType,
    size: file.size,
  };
}

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
  attachments?: InquiryAttachment[];
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
  unreadMessages: number;
  unreadMessagesCustomer: number;
  total: number;
}> {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.synagogueId) params.set('synagogueId', opts.synagogueId);
  const q = params.toString() ? `?${params}` : '';
  const res = await fetch(`/api/inquiries${q}`, { cache: 'no-store' });
  return parseJson(res);
}

export async function markInquiriesSeen(input: {
  role: InquiryAuthor;
  synagogueId?: string;
  id?: string;
}): Promise<{ ok: boolean; updated: number }> {
  const res = await fetch('/api/inquiries/seen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
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
  attachments?: InquiryAttachment[];
}): Promise<{ ok: boolean; item: Inquiry }> {
  const res = await fetch(`/api/inquiries/${encodeURIComponent(input.id)}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: input.text,
      author: input.author,
      name: input.name,
      attachments: input.attachments,
    }),
  });
  return parseJson(res);
}
