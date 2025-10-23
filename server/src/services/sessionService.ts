import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { db } from "../lib/db";
import { env } from "../lib/env";

const SALT_ROUNDS = 12;
const DEFAULT_PASSWORD_VERSION = 1;

const hashPassword = (password: string) => bcrypt.hashSync(password, SALT_ROUNDS);
const verifyPassword = (password: string, hash: string) => bcrypt.compareSync(password, hash);

const SETTINGS_KEY = "portal_password_hash";
const PASSWORD_VERSION_KEY = "portal_password_version";

const getSetting = (key: string): string | null => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
};

const setSetting = (key: string, value: string) => {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`
  ).run(key, value);
};

const ensurePasswordHash = () => {
  const existingHash = getSetting(SETTINGS_KEY);
  const envPassword = env.PORTAL_PASSWORD;
  const versionRaw = getSetting(PASSWORD_VERSION_KEY);
  const currentVersion = versionRaw ? Number(versionRaw) : 0;

  if (!existingHash || !verifyPassword(envPassword, existingHash)) {
    const newHash = hashPassword(envPassword);
    setSetting(SETTINGS_KEY, newHash);
    setSetting(PASSWORD_VERSION_KEY, String(currentVersion + 1));
    return;
  }

  if (!versionRaw) {
    setSetting(PASSWORD_VERSION_KEY, String(DEFAULT_PASSWORD_VERSION));
  }
};

ensurePasswordHash();

interface SessionRecord {
  id: string;
  password_version: number;
  expires_at: string;
}

const SESSION_SELECT = "SELECT id, password_version, expires_at FROM sessions WHERE id = ?";

export const sessionService = {
  createSession(): { token: string; expiresAt: Date } {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);
    const passwordVersion = Number(getSetting(PASSWORD_VERSION_KEY) ?? DEFAULT_PASSWORD_VERSION);

    db.prepare(
      `INSERT INTO sessions (id, password_version, created_at, expires_at)
       VALUES (?, ?, CURRENT_TIMESTAMP, ?)`
    ).run(token, passwordVersion, expiresAt.toISOString());

    return { token, expiresAt };
  },

  validateSession(token: string | undefined | null): SessionRecord | null {
    if (!token) return null;
    const row = db.prepare(SESSION_SELECT).get(token) as SessionRecord | undefined;
    if (!row) return null;

    const expiresAt = new Date(row.expires_at);
    if (expiresAt.getTime() < Date.now()) {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
      return null;
    }

    const passwordVersion = Number(getSetting(PASSWORD_VERSION_KEY) ?? DEFAULT_PASSWORD_VERSION);
    if (row.password_version !== passwordVersion) {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
      return null;
    }

    return row;
  },

  deleteSession(token: string) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
  },

  rotatePassword(newPassword: string) {
    const newHash = hashPassword(newPassword);
    setSetting(SETTINGS_KEY, newHash);
    const newVersion = Number(getSetting(PASSWORD_VERSION_KEY) ?? DEFAULT_PASSWORD_VERSION) + 1;
    setSetting(PASSWORD_VERSION_KEY, String(newVersion));
    db.prepare("DELETE FROM sessions").run();
  },

  verifyPortalPassword(candidate: string): boolean {
    const hash = getSetting(SETTINGS_KEY);
    if (!hash) return false;
    return verifyPassword(candidate, hash);
  },
};
