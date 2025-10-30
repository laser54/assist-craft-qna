import { Router } from "express";
import type { CookieOptions } from "express";
import { sessionService } from "../services/sessionService";
import { env } from "../lib/env";

const router = Router();

router.post("/login", (req, res) => {
  const { password } = req.body as { password?: string };
  console.log('=== DEBUG /login ===');
  console.log('Req body:', req.body);
  console.log('Env PORTAL_PASSWORD:', env.PORTAL_PASSWORD ? '[set, length ' + env.PORTAL_PASSWORD.length + ']' : 'EMPTY!');
  if (!password) {
    console.log('Missing password');
    return res.status(400).json({ message: "Password required" });
  }

  const valid = sessionService.verifyPortalPassword(password);
  console.log('Password valid:', valid);
  console.log('=================');
  if (!valid) {
    return res.status(401).json({ message: "Invalid password" });
  }

  const { token, expiresAt } = sessionService.createSession();
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    expires: expiresAt,
  };

  if (env.COOKIE_DOMAIN) {
    cookieOptions.domain = env.COOKIE_DOMAIN;
  }

  res.cookie(env.COOKIE_NAME, token, cookieOptions);
  return res.json({ ok: true, expiresAt });
});

router.post("/logout", (req, res) => {
  const clearOptions: CookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
  };
  if (env.COOKIE_DOMAIN) {
    clearOptions.domain = env.COOKIE_DOMAIN;
  }
  res.clearCookie(env.COOKIE_NAME, clearOptions);
  return res.json({ ok: true });
});

export const authRouter = router;
