import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../lib/env";

const SESSION_VERSION = "v1";

const sign = (payload: string): string => {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(`${SESSION_VERSION}:${env.PORTAL_PASSWORD}:${payload}`)
    .digest("hex");
};

const safeCompare = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
};

const buildToken = (expiresAt: Date): string => {
  const millis = expiresAt.getTime().toString(10);
  const signature = sign(millis);
  return `${SESSION_VERSION}.${millis}.${signature}`;
};

const parseToken = (token: string): { expiresAt: Date; signature: string } | null => {
  const parts = token.split(".") as [string, string, string] | string[];
  if (parts.length !== 3) {
    return null;
  }
  const [version, millis, signature] = parts as [string, string, string];
  if (version !== SESSION_VERSION) {
    return null;
  }
  const timestamp = Number.parseInt(millis, 10);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const expiresAt = new Date(timestamp);
  if (Number.isNaN(expiresAt.getTime())) {
    return null;
  }
  return { expiresAt, signature };
};

export const sessionService = {
  createSession(): { token: string; expiresAt: Date } {
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);
    const token = buildToken(expiresAt);
    return { token, expiresAt };
  },

  validateSession(token: string | undefined | null): { expiresAt: Date } | null {
    if (!token) return null;
    const parsed = parseToken(token);
    if (!parsed) return null;
    if (parsed.expiresAt.getTime() < Date.now()) {
      return null;
    }
    const expected = sign(parsed.expiresAt.getTime().toString(10));
    if (!safeCompare(parsed.signature, expected)) {
      return null;
    }
    return { expiresAt: parsed.expiresAt };
  },

  verifyPortalPassword(candidate: string): boolean {
    if (typeof candidate !== "string") {
      return false;
    }
    return safeCompare(candidate, env.PORTAL_PASSWORD);
  },
};
