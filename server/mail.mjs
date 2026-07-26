/**
 * SMTP mailer for screensmart notifications (trial, payment, expiry).
 *
 * Env:
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE (true/false)
 *   SMTP_USER, SMTP_PASS
 *   MAIL_FROM  (e.g. "screensmart <noreply@example.com>")
 *   MAIL_REPLY_TO (optional)
 */
import nodemailer from 'nodemailer';

const HOST = (process.env.SMTP_HOST || '').trim();
const PORT = Number(process.env.SMTP_PORT || 587);
const SECURE =
  String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || PORT === 465;
const USER = (process.env.SMTP_USER || '').trim();
const PASS = (process.env.SMTP_PASS || '').trim();
const FROM = (process.env.MAIL_FROM || USER || '').trim();
const REPLY_TO = (process.env.MAIL_REPLY_TO || '').trim();

let transporter = null;

export function mailConfigured() {
  return Boolean(HOST && FROM && (USER ? PASS : true));
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
 * @param {{ to: string|string[], subject: string, text: string, html?: string, bcc?: string|string[] }} opts
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
  try {
    const info = await tx.sendMail({
      from: FROM,
      to: to.join(', '),
      bcc: opts.bcc
        ? Array.isArray(opts.bcc)
          ? opts.bcc.filter(Boolean).join(', ')
          : opts.bcc
        : undefined,
      replyTo: REPLY_TO || undefined,
      subject: opts.subject,
      text: opts.text,
      html: opts.html || undefined,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('SMTP send failed', err);
    return { ok: false, error: String(err?.message || err).slice(0, 200) };
  }
}

export async function verifySmtp() {
  const tx = getTransporter();
  if (!tx) return { ok: false, error: 'SMTP לא מוגדר' };
  try {
    await tx.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 200) };
  }
}
