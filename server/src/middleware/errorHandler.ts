import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../lib/httpError";

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }

  console.error("Unhandled error", err);
  return res.status(500).json({ message: "Internal Server Error" });
};
