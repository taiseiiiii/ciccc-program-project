import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  // Comma-separated list of allowed frontend origins (5173 = Vite dev server).
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // Supabase Auth. Tokens are verified against the project's JWKS endpoint by
  // default; set SUPABASE_JWT_SECRET only for legacy projects that still sign
  // access tokens with HS256.
  supabaseUrl: required('SUPABASE_URL').replace(/\/+$/, ''),
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET || undefined,
} as const;

export const isProduction = env.nodeEnv === 'production';
