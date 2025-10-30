import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./lib/env";
import "./lib/db";
import { authRouter } from "./routes/auth";
import { authMiddleware } from "./middleware/authMiddleware";
import { errorHandler } from "./middleware/errorHandler";
import { qaRouter } from "./routes/qa";
import { searchRouter } from "./routes/search";
import { qaService } from "./services/qaService";
import { pineconeService } from "./services/pineconeService";
import { settingsRouter } from "./routes/settings";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/auth", authRouter);

console.log('=== DEBUG SERVER START ===');
console.log('Listening on PORT:', env.PORT);
console.log('Auth router mounted at /api/auth');
console.log('===================');

app.get("/api/metrics", authMiddleware, async (_req, res, next) => {
  try {
    const totalQa = qaService.count();
    let pineconeVectors: number | null = null;
    if (pineconeService.isConfigured()) {
      const stats = await pineconeService.describeIndexStats();
      pineconeVectors = stats?.totalRecordCount ?? null;
    }
    res.json({ ok: true, totalQa, pineconeVectors });
  } catch (error) {
    next(error);
  }
});

app.use("/api/qa", authMiddleware, qaRouter);
app.use("/api/search", authMiddleware, searchRouter);
app.use("/api/settings", authMiddleware, settingsRouter);

app.use(errorHandler);

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});

export default app;

