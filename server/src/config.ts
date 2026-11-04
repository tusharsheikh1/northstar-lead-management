import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('change-me'))) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}

const env = (k: string) => (process.env[k] ?? '').trim();

export const config = {
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://northstar:northstar@localhost:5432/northstar',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-not-for-production-use-0123456789',
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT ?? 30), // sign-in/register attempts per IP per 15 min
  /** Public URL of the web app, used in links inside emails. */
  appUrl: (env('APP_URL') || 'http://localhost:5173').replace(/\/$/, ''),
  email: {
    host: env('SMTP_HOST'), port: Number(env('SMTP_PORT') || 587), secure: env('SMTP_SECURE') === 'true',
    user: env('SMTP_USER'), pass: env('SMTP_PASS'),
    from: env('MAIL_FROM') || 'Northstar CRM <no-reply@localhost>',
    /** `log` = write emails to the server log and mark them "logged" (NOT delivered). Dev only. */
    logOnly: env('EMAIL_TRANSPORT') === 'log',
  },
  sms: {
    /** bulksmsbd | alphasms | sslwireless | log | (empty = disabled) */
    provider: env('SMS_PROVIDER').toLowerCase(),
    apiKey: env('SMS_API_KEY'),
    senderId: env('SMS_SENDER_ID'),
    sslSid: env('SSLWIRELESS_SID'),
    // Endpoint overrides exist mainly so tests can point at a local mock.
    urlOverride: env('SMS_API_URL'),
    balanceUrlOverride: env('SMS_BALANCE_URL'),
  },
  scheduler: { enabled: env('DISABLE_SCHEDULER') !== 'true' },
  corsOrigin: process.env.CORS_ORIGIN || '',
};
