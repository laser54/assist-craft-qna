import { Router } from "express";
import { z } from "zod";
import { qaService } from "../services/qaService";
import { HttpError } from "../lib/httpError";

const router = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().optional(),
});

const qaBodySchema = z.object({
  question: z.string().trim().min(1, "Question is required"),
  answer: z.string().trim().min(1, "Answer is required"),
  language: z.string().trim().min(2).max(8).optional(),
});

router.get("/", (req, res, next) => {
  try {
    const params = listQuerySchema.parse(req.query);
    const result = qaService.list(params);
    res.json({
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      items: result.items,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = qaBodySchema.parse(req.body ?? {});
    const qa = qaService.create(body);
    try {
      await qaService.syncVector(qa);
    } catch (error) {
      console.error("Failed to sync Pinecone for QA", qa.id, error);
    }
    const fresh = qaService.getById(qa.id);
    res.status(201).json(fresh);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = qaService.getById(id);
    if (!existing) {
      throw new HttpError(404, "QA pair not found");
    }
    const body = qaBodySchema.parse(req.body ?? {});
    const updated = qaService.update(id, body);
    if (!updated) {
      throw new HttpError(404, "QA pair not found");
    }
    try {
      await qaService.syncVector(updated);
    } catch (error) {
      console.error("Failed to re-sync Pinecone for QA", id, error);
    }
    res.json(qaService.getById(id));
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = qaService.getById(id);
    if (!existing) {
      throw new HttpError(404, "QA pair not found");
    }
    await qaService.removeVector(id);
    qaService.delete(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export const qaRouter = router;


