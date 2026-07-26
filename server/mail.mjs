/**
 * SMTP mailer for screensmart notifications (trial, payment, expiry).
 *
 * Env:
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE (true/false)
 *   SMTP_USER, SMTP_PASS  — mailbox on your domain (e.g. noreply@landing-p.co.il)
 *   MAIL_FROM  — must use the SAME domain as SMTP_USER
 *   MAIL_REPLY_TO (optional)
 */
import nodemailer from 'nodemailer';

const HOST = (process.env.SMTP_HOST || '').trim();
const PORT = Number(process.env.SMTP_PORT || 587);
const SECURE =
  String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || PORT === 465;
const USER = (process.env.SMTP_USER || '').trim();
const PASS = (process.env.SMTP_PASS || '').trim();
const FROM_RAW = (process.env.MAIL_FROM || '').trim();
const REPLY_TO = (process.env.MAIL_REPLY_TO || '').trim();

let transporter = null;

function extractEmail(value) {
  if (!value) return '';
  const m = /<([^>]+)>/.exec(value);
  const email = (m ? m[1] : value).trim();
  return email.includes('@') ? email.toLowerCase() : '';
}

function domainOf(email) {
  const at = email.lastIndexOf('@');
  return at > 0 ? email.slice(at + 1).toLowerCase() : '';
}

/**
 * Hosts often reject 550 if From-domain ≠ authenticated mailbox domain.
 * Keep a nice display name, but force the address onto SMTP_USER's domain.
 */
function resolveFromAddress() {
  const authEmail = extractEmail(USER) || USER;
  const authDomain = domainOf(authEmail);
  if (!authEmail) return FROM_RAW || '';

  const rawEmail = extractEmail(FROM_RAW);
  const rawDomain = domainOf(rawEmail);
  const displayMatch = /^"?([^"<]+)"?\s*</.exec(FROM_RAW);
  const displayName = (displayMatch?.[1] || 'screensmart').trim() || 'screensmart';

  // Prefer MAIL_FROM only when its domain matches the logged-in mailbox.
  if (rawEmail && authDomain && rawDomain === authDomain) {
    return FROM_RAW.includes('<') ? FROM_RAW : `${displayName} <${rawEmail}>`;
  }

  return `${displayName} <${authEmail}>`;
}

const FROM = resolveFromAddress();

export function mailConfigured() {
  return Boolean(HOST && (FROM || USER) && (USER ? PASS : true));
}

export function mailStatus() {
  return {
    configured: mailConfigured(),
    host: HOST || null,
    port: PORT,
    secure: SECURE,
    from: FROM || null,
    user: USER ? USER.replace(/(^.).*(@.*$)/, '$1***$2') : null,
  };
}

function getTransporter() {
  if (!mailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: SECURE,
      auth: USER ? { user: USER, pass: PASS } : undefined,
    });
  }
  return transporter;
}

/**
 * @param {{ to: string|string[], subject: string, text: string, html?: string, bcc?: string|string[], replyTo?: string }} opts
 */
export async function sendMail(opts) {
  const tx = getTransporter();
  if (!tx) {
    return { ok: false, skipped: true, error: 'SMTP לא מוגדר בשרת' };
  }
  const to = Array.isArray(opts.to) ? opts.to.filter(Boolean) : [opts.to].filter(Boolean);
  if (!to.length) {
    return { ok: false, skipped: true, error: 'אין כתובת נמען' };
  }
  const from = resolveFromAddress();
  const replyTo = (opts.replyTo || REPLY_TO || '').trim() || undefined;
  try {
    const info = await tx.sendMail({
      from,
      // Some hosts also check envelope sender — keep it on the auth mailbox.
      envelope: USER
        ? {
            from: extractEmail(USER) || USER,
            to,
          }
        : undefined,
      to: to.join(', '),
      bcc: opts.bcc
        ? Array.isArray(opts.bcc)
          ? opts.bcc.filter(Boolean).join(', ')
          : opts.bcc
        : undefined,
      replyTo,
      subject: opts.subject,
      text: opts.text,
      html: opts.html || undefined,
    });
    return { ok: true, messageId: info.messageId, from };
  } catch (err) {
    console.error('SMTP send failed', err);
    return { ok: false, error: String(err?.message || err).slice(0, 280) };
  }
}

export async function verifySmtp() {
  const tx = getTransporter();
  if (!tx) return { ok: false, error: 'SMTP לא מוגדר' };
  try {
    await tx.verify();
    return { ok: true, from: resolveFromAddress() };
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 280) };
  }
}
