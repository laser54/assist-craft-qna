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
});

export type Env = z.infer<typeof envSchema> & {
  cookieSecure: boolean;
};

export const env: Env = (() => {
  const base = envSchema.parse(process.env);
  const cookieSecure = base.COOKIE_SECURE
    ? base.COOKIE_SECURE.toLowerCase() === "true"
    : base.NODE_ENV === "production";

  return {
    ...base,
    cookieSecure,
  };
})();
