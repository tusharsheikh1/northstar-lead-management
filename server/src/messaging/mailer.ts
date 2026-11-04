import nodemailer from 'nodemailer';
import { config } from '../config.js';

export type ChannelMode = 'live' | 'log' | 'none';

export const emailMode = (): ChannelMode => (config.email.host ? 'live' : config.email.logOnly ? 'log' : 'none');

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransport() {
  transport ??= nodemailer.createTransport({
    host: config.email.host, port: config.email.port, secure: config.email.secure,
    auth: config.email.user ? { user: config.email.user, pass: config.email.pass } : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
  return transport;
}

export interface OutgoingEmail { to: string; subject: string; text: string; html?: string }

/** Sends one email. Throws on failure. In `log` mode nothing is delivered. */
export async function sendEmail(m: OutgoingEmail): Promise<{ status: 'sent' | 'logged'; ref?: string }> {
  const mode = emailMode();
  if (mode === 'none') throw new Error('Email delivery is not configured on this server.');
  if (mode === 'log') {
    console.log(`[email:log] to=${m.to} subject="${m.subject}"\n${m.text}\n`);
    return { status: 'logged' };
  }
  const info = await getTransport().sendMail({ from: config.email.from, to: m.to, subject: m.subject, text: m.text, html: m.html });
  return { status: 'sent', ref: info.messageId };
}

/** Drops the cached SMTP connection settings (used by tests that change the SMTP target). */
export function resetTransport() { transport = null; }
