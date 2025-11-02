import { Router } from "express";
import { z } from "zod";
import { settingsService } from "../services/settingsService";

const router = Router();

const updateSchema = z
  .object({
    topResultsCount: z.number().int().min(1).max(50).optional(),
    similarityThreshold: z.number().min(0).max(1).optional(),
    model: z.string().trim().min(1).max(128).optional(),
    rerankModel: z.string().trim().min(1).max(128).optional().nullable(),
    csvBatchSize: z.number().int().min(1).max(500).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one setting must be provided",
  });

router.get("/", (_req, res) => {
  const settings = settingsService.get();
  res.json({ ok: true, settings });
});

router.put("/", (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body ?? {});
    const updated = settingsService.update({
      ...(body.topResultsCount !== undefined ? { topResultsCount: body.topResultsCount } : {}),
      ...(body.similarityThreshold !== undefined ? { similarityThreshold: body.similarityThreshold } : {}),
      ...(body.model !== undefined ? { model: body.model } : {}),
      ...(body.rerankModel !== undefined ? { rerankModel: body.rerankModel } : {}),
      ...(body.rerankEnabled !== undefined ? { rerankEnabled: body.rerankEnabled } : {}),
      ...(body.csvBatchSize !== undefined ? { csvBatchSize: body.csvBatchSize } : {}),
    });
    res.json({ ok: true, settings: updated });
  } catch (error) {
    next(error);
  }
});

export const settingsRouter = router;


