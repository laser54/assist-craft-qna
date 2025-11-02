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
    const result = qaService.list({
      ...(params.page !== undefined ? { page: params.page } : {}),
      ...(params.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
      ...(params.search !== undefined ? { search: params.search } : {}),
    });
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
    console.log(`[POST /qa] Received request: question="${body.question.substring(0, 50)}...", answer length=${body.answer.length}, language=${body.language ?? "undefined"}`);
    const createInput = {
      question: body.question,
      answer: body.answer,
      ...(body.language !== undefined ? { language: body.language } : {}),
    };
    const result = qaService.create(createInput);
    console.log(`[POST /qa] Created QA ${result.record.id}, replaced: ${result.replaced}, question="${result.record.question.substring(0, 50)}..."`);
    
    try {
      await qaService.syncVectorWithRetry(result.record);
    } catch (error) {
      console.error(`[POST /qa] Failed to sync Pinecone for QA ${result.record.id} after all retries:`, error);
    }
    
    const fresh = qaService.getById(result.record.id);
    console.log(`[POST /qa] Returning QA ${fresh?.id}, embedding_status=${fresh?.embedding_status}, pinecone_id=${fresh?.pinecone_id ?? "null"}`);
    const statusCode = result.replaced ? 200 : 201;
    res.status(statusCode).json({
      item: fresh,
      replaced: result.replaced,
    });
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
    const updateInput = {
      question: body.question,
      answer: body.answer,
      ...(body.language !== undefined ? { language: body.language } : {}),
    };
    const updated = qaService.update(id, updateInput);
    if (!updated) {
      throw new HttpError(404, "QA pair not found");
    }
    try {
      await qaService.syncVectorWithRetry(updated);
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
    const vectorResult = await qaService.removeVector(existing);
    qaService.delete(id);
    res.json({
      deleted: true,
      vectorRemoved: vectorResult.removed,
      vectorSkipped: vectorResult.skipped,
      vectorError: vectorResult.error ?? null,
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/", async (req, res, next) => {
  try {
    const result = await qaService.deleteAll();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/resync", async (req, res, next) => {
  try {
    const result = await qaService.resyncAll();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export const qaRouter = router;


