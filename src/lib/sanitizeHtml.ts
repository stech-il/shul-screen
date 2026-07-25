const ALLOWED_TAGS = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'br',
  'p',
  'div',
  'span',
  'ul',
  'ol',
  'li',
  'font',
]);

const ALLOWED_STYLES = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-style',
  'font-family',
  'text-align',
  'text-decoration',
  'direction',
]);

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeStyle(style: string): string {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const i = part.indexOf(':');
      if (i < 0) return '';
      const prop = part.slice(0, i).trim().toLowerCase();
      const value = part.slice(i + 1).trim();
      if (!ALLOWED_STYLES.has(prop)) return '';
      if (/expression|url\s*\(|javascript:|@import/i.test(value)) return '';
      return `${prop}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');
}

function walk(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(escapeText(node.textContent ?? ''));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object') return;

  if (!ALLOWED_TAGS.has(tag)) {
    Array.from(el.childNodes).forEach((child) => walk(child, out));
    return;
  }

  const attrs: string[] = [];
  if (tag === 'font') {
    const color = el.getAttribute('color');
    const size = el.getAttribute('size');
    const face = el.getAttribute('face');
    if (color && /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$/.test(color)) attrs.push(`color="${escapeText(color)}"`);
    if (size && /^[1-7]$/.test(size)) attrs.push(`size="${size}"`);
    if (face && /^[\w\s,'"-]+$/.test(face)) attrs.push(`face="${escapeText(face)}"`);
  }
  const style = el.getAttribute('style');
  if (style) {
    const clean = sanitizeStyle(style);
    if (clean) attrs.push(`style="${escapeText(clean)}"`);
  }
  const align = el.getAttribute('align');
  if (align && /^(left|right|center|justify)$/i.test(align)) {
    attrs.push(`align="${align.toLowerCase()}"`);
  }

  const open = attrs.length ? `<${tag} ${attrs.join(' ')}>` : `<${tag}>`;
  if (tag === 'br') {
    out.push('<br>');
    return;
  }
  out.push(open);
  Array.from(el.childNodes).forEach((child) => walk(child, out));
  out.push(`</${tag}>`);
}

/** Escape plain text and keep line breaks as <br>. */
export function plainToHtml(text: string): string {
  return escapeText(text).replace(/\r\n|\n|\r/g, '<br>');
}

/** True when string looks like it already contains HTML markup. */
export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

/**
 * Sanitize rich HTML for safe display. Plain text is escaped with <br> for newlines.
 */
export function sanitizeRichHtml(input: string): string {
  const raw = (input ?? '').trim();
  if (!raw) return '';
  if (!looksLikeHtml(raw)) return plainToHtml(raw);

  if (typeof document === 'undefined') {
    return escapeText(raw);
  }

  const wrap = document.createElement('div');
  wrap.innerHTML = raw;
  const out: string[] = [];
  Array.from(wrap.childNodes).forEach((child) => walk(child, out));
  return out.join('');
}
