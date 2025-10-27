import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  PORT: z.coerce.number().min(1).max(65535).default(8080),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORTAL_PASSWORD: z.string().min(8, "PORTAL_PASSWORD must be at least 8 characters"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  SQLITE_PATH: z.string().default("./data/app.db"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 12),
  COOKIE_NAME: z.string().default("auth_token"),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z.string().optional(),
  PINECONE_API_KEY: z.string().trim().min(1).optional(),
  PINECONE_INDEX: z.string().trim().min(1).optional(),
  PINECONE_HOST: z.string().trim().min(1).optional(),
  PINECONE_EMBED_MODEL: z.string().trim().min(1).optional(),
  PINECONE_RERANK_MODEL: z.string().trim().min(1).optional(),
  CSV_BATCH_SIZE: z.coerce.number().int().positive().default(25),
  DEFAULT_LOCALE: z.string().trim().min(2).default("ru-RU"),
});

export type Env = z.infer<typeof envSchema> & {
  cookieSecure: boolean;
  pineconeConfigured: boolean;
};

export const env: Env = (() => {
  const base = envSchema.parse(process.env);
  const cookieSecure = base.COOKIE_SECURE
    ? base.COOKIE_SECURE.toLowerCase() === "true"
    : base.NODE_ENV === "production";
  const pineconeConfigured = Boolean(
    base.PINECONE_API_KEY &&
      base.PINECONE_INDEX &&
      base.PINECONE_HOST &&
      base.PINECONE_EMBED_MODEL
  );

  return {
    ...base,
    cookieSecure,
    pineconeConfigured,
  };
})();
