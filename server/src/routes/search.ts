import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../lib/httpError";
import { qaService } from "../services/qaService";
import { pineconeService } from "../services/pineconeService";
import { embeddingService } from "../services/embeddingService";
import { rerankService } from "../services/rerankService";
import { env } from "../lib/env";

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

    const candidates = matches
      .map((match) => {
        if (!match.id) return null;
        const qa = qaById.get(match.id);
        if (!qa) return null;
        const text = `${qa.question}\n\n${qa.answer}`;
        const baseScore = match.score ?? 0;
        return {
          id: qa.id,
          baseScore,
          text,
          qa,
        };
      })
      .filter((candidate): candidate is { id: string; baseScore: number; text: string; qa: typeof qaPairs[number] } => Boolean(candidate));

    const vectorScores = candidates.map((candidate) => ({ id: candidate.id, score: candidate.baseScore }));

    const pipeline = {
      vector: {
        index: env.PINECONE_INDEX ?? null,
        namespace: "qa",
        topK,
      },
      rerank: {
        model: null as string | null,
        applied: false,
        fallbackReason: rerankService.isConfigured() ? null : "Rerank model is not configured",
        attemptedModels: rerankService.isConfigured() ? rerankService.candidateModels() : [],
      },
    };

    let reranked: { id: string; score: number }[];
    if (!rerankService.isConfigured()) {
      reranked = vectorScores;
    } else {
      try {
        const rerankOutcome = await rerankService.rerank(
          query,
          candidates.map((candidate) => ({ id: candidate.id, text: candidate.text })),
          topK,
        );
        pipeline.rerank.model = rerankOutcome.model;
        pipeline.rerank.attemptedModels = rerankOutcome.attemptedModels;
        if (rerankOutcome.results.length > 0) {
          reranked = rerankOutcome.results;
          pipeline.rerank.applied = true;
          pipeline.rerank.fallbackReason = rerankOutcome.warning;
        } else {
          reranked = vectorScores;
          pipeline.rerank.applied = false;
          pipeline.rerank.fallbackReason = rerankOutcome.warning ?? "Rerank returned no results";
        }
      } catch (error) {
        console.warn("Rerank failed, falling back to Pinecone scores", error);
        reranked = vectorScores;
        pipeline.rerank.applied = false;
        pipeline.rerank.fallbackReason = error instanceof Error ? error.message : "Unknown rerank failure";
        pipeline.rerank.attemptedModels = rerankService.candidateModels();
      }
    }

    const rerankedMap = new Map(reranked.map((item) => [item.id, item.score]));

    const results = candidates
      .map((candidate) => {
        const finalScore = rerankedMap.has(candidate.id)
          ? rerankedMap.get(candidate.id) ?? candidate.baseScore
          : candidate.baseScore;
        return {
          id: candidate.qa.id,
          score: finalScore,
          question: candidate.qa.question,
          answer: candidate.qa.answer,
          language: candidate.qa.language,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    res.json({
      query,
      topK,
      matches: results,
      pipeline,
    });
  } catch (error) {
    next(error);
  }
});

export const searchRouter = router;


