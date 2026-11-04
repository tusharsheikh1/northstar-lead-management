import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import type { ChannelMode } from './mailer.js';
import { normalizeBdMobile } from './phone.js';

export const SMS_PROVIDERS = ['bulksmsbd', 'alphasms', 'sslwireless'] as const;
export const MAX_SMS_CHARS = 480; // ~3 GSM segments; Bangla (Unicode) text is 70 chars per segment

export function smsMode(): ChannelMode {
  const p = config.sms.provider;
  if (p === 'log') return 'log';
  if (p === 'sslwireless') return config.sms.apiKey && config.sms.sslSid ? 'live' : 'none';
  if ((SMS_PROVIDERS as readonly string[]).includes(p)) return config.sms.apiKey ? 'live' : 'none';
  return 'none';
}

const TIMEOUT = 10_000;
async function readJson(res: Response) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(`SMS gateway returned an unexpected response (HTTP ${res.status}).`); }
}

/**
 * Gateway adapters. These follow each provider's public HTTP API documentation but have only been
 * exercised against local mock servers - verify with a real test message and your own account.
 */
const adapters: Record<string, (to: string, text: string) => Promise<{ ref?: string }>> = {
  // https://bulksmsbd.net  - success when response_code === 202
  async bulksmsbd(to, text) {
    const res = await fetch(config.sms.urlOverride || 'http://bulksmsbd.net/api/smsapi', {
      method: 'POST', signal: AbortSignal.timeout(TIMEOUT),
      body: new URLSearchParams({ api_key: config.sms.apiKey, type: 'text', number: to, senderid: config.sms.senderId, message: text }),
    });
    const j = await readJson(res);
    if (Number(j.response_code) !== 202) throw new Error(`BulkSMSBD rejected the message: ${j.error_message || j.response_code || res.status}`);
    return { ref: j.message_id ? String(j.message_id) : undefined };
  },
  // https://sms.net.bd (Alpha SMS) - success when error === 0
  async alphasms(to, text) {
    const body = new URLSearchParams({ api_key: config.sms.apiKey, msg: text, to });
    if (config.sms.senderId) body.set('sender_id', config.sms.senderId);
    const res = await fetch(config.sms.urlOverride || 'https://api.sms.net.bd/sendsms', { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT) });
    const j = await readJson(res);
    if (Number(j.error) !== 0) throw new Error(`Alpha SMS rejected the message: ${j.msg || j.error}`);
    return { ref: j.data?.request_id ? String(j.data.request_id) : undefined };
  },
  // https://sslwireless.com SMS Plus v3 - success when status === "SUCCESS"
  async sslwireless(to, text) {
    const csms = randomUUID().replace(/-/g, '').slice(0, 20);
    const res = await fetch(config.sms.urlOverride || 'https://smsplus.sslwireless.com/api/v3/send-sms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(TIMEOUT),
      body: JSON.stringify({ api_token: config.sms.apiKey, sid: config.sms.sslSid, msisdn: to, sms: text, csms_id: csms }),
    });
    const j = await readJson(res);
    if (String(j.status).toUpperCase() !== 'SUCCESS') throw new Error(`SSL Wireless rejected the message: ${j.error_message || j.status_code || res.status}`);
    return { ref: csms };
  },
};

/** Sends one SMS to a Bangladeshi mobile number. Throws on failure. In `log` mode nothing is delivered. */
export async function sendSms(rawTo: string, text: string): Promise<{ status: 'sent' | 'logged'; ref?: string }> {
  const mode = smsMode();
  if (mode === 'none') throw new Error('SMS delivery is not configured on this server.');
  const to = normalizeBdMobile(rawTo);
  if (!to) throw new Error('Not a valid Bangladeshi mobile number.');
  if (mode === 'log') {
    console.log(`[sms:log] to=+${to}\n${text}\n`);
    return { status: 'logged' };
  }
  const out = await adapters[config.sms.provider](to, text);
  return { status: 'sent', ref: out.ref };
}
