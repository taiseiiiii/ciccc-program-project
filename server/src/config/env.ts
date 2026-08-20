import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  // Comma-separated list of allowed frontend origins (5173 = Vite dev server).
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  // Supabase Auth. Tokens are verified against the project's JWKS endpoint by
  // default; set SUPABASE_JWT_SECRET only for legacy projects that still sign
  // access tokens with HS256.
  supabaseUrl: required("SUPABASE_URL").replace(/\/+$/, ""),
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET || undefined,
  // OpenAI (AI analysis). Optional so the server still boots without a key —
  // the AI endpoints then answer 503 instead of taking the whole API down.
  openaiApiKey: process.env.OPENAI_API_KEY || undefined,
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o",
  // Cloudflare R2 (photo/video storage). Optional for the same reason as the
  // OpenAI key: a server without it still runs, and only the media endpoints
  // answer 503. See ../services/r2.service.ts.
  r2AccountId: process.env.R2_ACCOUNT_ID || undefined,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || undefined,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || undefined,
  r2Bucket: process.env.R2_BUCKET || undefined,
} as const;

export const isProduction = env.nodeEnv === "production";
