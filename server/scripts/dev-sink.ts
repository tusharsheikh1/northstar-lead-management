/**
 * Local stand-in for an SMTP server and an SMS gateway, for development and tests.
 * Nothing leaves your machine. Point the API at it with:
 *
 *   SMTP_HOST=127.0.0.1 SMTP_PORT=1025
 *   SMS_PROVIDER=bulksmsbd SMS_API_KEY=dev SMS_SENDER_ID=NSTAR SMS_API_URL=http://127.0.0.1:1026/sms
 *
 * Then open http://127.0.0.1:1027/ to see everything that was "sent" (JSON), or DELETE /reset to clear it.
 */
import http from 'node:http';
import { SMTPServer } from 'smtp-server';

const SMTP_PORT = Number(process.env.SINK_SMTP_PORT ?? 1025);
const SMS_PORT = Number(process.env.SINK_SMS_PORT ?? 1026);
const VIEW_PORT = Number(process.env.SINK_VIEW_PORT ?? 1027);

const emails: { at: string; to: string[]; subject: string; text: string }[] = [];
const texts: { at: string; number: string; message: string; senderid: string }[] = [];
const decodeQp = (s: string) => s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));

new SMTPServer({
  authOptional: true, disabledCommands: ['STARTTLS'],
  onData(stream, session, cb) {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const subject = decodeQp(raw.match(/^Subject: (.*)$/m)?.[1] ?? '');
      emails.push({ at: new Date().toISOString(), to: session.envelope.rcptTo.map((r) => r.address), subject, text: decodeQp(raw) });
      cb();
    });
  },
}).listen(SMTP_PORT, '127.0.0.1', () => console.log(`SMTP sink on 127.0.0.1:${SMTP_PORT}`));

// Mimics BulkSMSBD: form-encoded POST, answers {"response_code":202} on success.
http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const f = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));
    texts.push({ at: new Date().toISOString(), number: f.number, message: f.message, senderid: f.senderid });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ response_code: 202, success_message: 'SMS Submitted Successfully' }));
  });
}).listen(SMS_PORT, '127.0.0.1', () => console.log(`SMS sink on 127.0.0.1:${SMS_PORT}`));

http.createServer((req, res) => {
  if (req.method === 'DELETE' && req.url === '/reset') { emails.length = 0; texts.length = 0; res.end('{"ok":true}'); return; }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ emails, sms: texts }, null, 2));
}).listen(VIEW_PORT, '127.0.0.1', () => console.log(`Viewer on http://127.0.0.1:${VIEW_PORT}/`));
