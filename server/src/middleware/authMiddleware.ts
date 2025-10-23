import type { Request, Response, NextFunction } from "express";
import { sessionService } from "../services/sessionService";
import { env } from "../lib/env";

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[env.COOKIE_NAME];
  const session = sessionService.validateSession(token);
  if (!session) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  res.locals.session = session;
  return next();
};
