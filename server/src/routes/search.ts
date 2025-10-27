import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../lib/httpError";
import { qaService } from "../services/qaService";
import { pineconeService } from "../services/pineconeService";
import { embeddingService } from "../services/embeddingService";

const router = Router();

const searchSchema = z.object({
  query: z.string().trim().min(1, "Query is required"),
  topK: z.coerce.number().int().positive().max(20).default(5),
});

router.get("/", async (req, res, next) => {
  try {
    if (!pineconeService.isConfigured()) {
      throw new HttpError(503, "Vector search is not available yet");
    }

    const { query, topK } = searchSchema.parse(req.query);

    const embeddingResult = await embeddingService.embed(query);
    const matches = await pineconeService.query({
      vector: embeddingResult.embedding,
      topK,
    });

    const ids = matches.map((match) => match.id).filter(Boolean) as string[];
    const qaPairs = qaService.findByIds(ids);
    const qaById = new Map(qaPairs.map((qa) => [qa.id, qa]));

    const results = matches
      .map((match) => {
        if (!match.id) return null;
        const qa = qaById.get(match.id);
        if (!qa) return null;
        return {
          id: qa.id,
          score: match.score ?? 0,
          question: qa.question,
          answer: qa.answer,
          language: qa.language,
        };
      })
      .filter(Boolean);

    res.json({
      query,
      topK,
      matches: results,
    });
  } catch (error) {
    next(error);
  }
});

export const searchRouter = router;


