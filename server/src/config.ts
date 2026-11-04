import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('change-me'))) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}

export const config = {
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://northstar:northstar@localhost:5432/northstar',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-not-for-production-use-0123456789',
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT ?? 30), // sign-in/register attempts per IP per 15 min
  corsOrigin: process.env.CORS_ORIGIN || '',
};
