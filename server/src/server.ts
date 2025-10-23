import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./lib/env";
import "./lib/db";
import { authRouter } from "./routes/auth";
import { authMiddleware } from "./middleware/authMiddleware";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/auth", authRouter);

app.get("/api/metrics", authMiddleware, (_req, res) => {
  res.json({ ok: true });
});

app.use(errorHandler);

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});

export default app;

