import { Router } from "express";
import { sessionService } from "../services/sessionService";
import { env } from "../lib/env";

const router = Router();

router.post("/login", (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password) {
    return res.status(400).json({ message: "Password required" });
  }

  const valid = sessionService.verifyPortalPassword(password);
  if (!valid) {
    return res.status(401).json({ message: "Invalid password" });
  }

  const { token, expiresAt } = sessionService.createSession();
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    domain: env.COOKIE_DOMAIN,
    expires: expiresAt,
  });
  return res.json({ ok: true, expiresAt });
});

router.post("/logout", (req, res) => {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (token) {
    sessionService.deleteSession(token);
    res.clearCookie(env.COOKIE_NAME);
  }
  return res.json({ ok: true });
});

export const authRouter = router;
