import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../lib/httpError";
import { qaService } from "../services/qaService";
import { pineconeService } from "../services/pineconeService";
import { embeddingService } from "../services/embeddingService";
import { rerankService, type RerankUsageDetails, type RerankUsageAggregate } from "../services/rerankService";
import { env } from "../lib/env";

const router = Router();

const searchSchema = z.object({
  query: z.string().trim().min(1, "Query is required"),
  topK: z.coerce.number().int().positive().max(20).default(5),
});

const toUsageDetails = (snapshot: RerankUsageAggregate, lastCallUnits = 0): RerankUsageDetails => ({
  ...snapshot,
  lastCallUnits,
});

router.get("/", async (req, res, next) => {
  try {
    if (!pineconeService.isConfigured()) {
      throw new HttpError(503, "Vector search is not available yet");
    }

    const { query, topK } = searchSchema.parse(req.query);

    console.log(`[Search] Query: "${query}", topK: ${topK}`);
    console.log(`[Search] Using index: ${env.PINECONE_INDEX}, namespace: qa`);
    
    const embeddingResult = await embeddingService.embed(query);
    console.log(`[Search] Embedding model: ${embeddingResult.model}, dimension: ${embeddingResult.dimension}`);
    
    let matches = await pineconeService.query({
      vector: embeddingResult.embedding,
      topK,
      namespace: "qa",
    });
    
    if (matches.length === 0 || matches[0]?.score && matches[0].score < 0.3) {
      console.log(`[Search] No good matches in namespace "qa", trying default namespace ""`);
      const defaultMatches = await pineconeService.query({
        vector: embeddingResult.embedding,
        topK,
        namespace: "",
      });
      if (defaultMatches.length > 0 && defaultMatches[0]?.score && defaultMatches[0].score > (matches[0]?.score ?? 0)) {
        console.log(`[Search] Found better matches in default namespace, top score: ${defaultMatches[0].score}`);
        matches = defaultMatches;
      }
    }

    console.log(`[Search] Pinecone returned ${matches.length} matches`);
    matches.forEach((match, idx) => {
      const metadata = (match.metadata ?? {}) as Record<string, unknown>;
      const question = typeof metadata.question === "string" ? metadata.question : "no question";
      console.log(`[Search] Match ${idx + 1}: ID=${match.id}, score=${match.score?.toFixed(6) ?? "null"}, question="${question.substring(0, 50)}..."`);
    });

    const ids = matches.map((match) => match.id).filter((value): value is string => typeof value === "string" && value.length > 0);
    const qaPairs = ids.length > 0 ? qaService.findByIds(ids) : [];
    const qaById = new Map(qaPairs.map((qa) => [qa.id, qa]));

    const candidates = matches
      .map((match) => {
        if (!match.id) return null;
        const baseScore = match.score ?? 0;
        const metadata = (match.metadata ?? {}) as Record<string, unknown>;
        const fallback = qaById.get(match.id) ?? null;

        const hasMetadata = typeof metadata.question === "string" && typeof metadata.answer === "string";
        
        if (!hasMetadata && !fallback) {
          console.warn(`[Search] Skipping match ${match.id} - no metadata and not in SQLite`);
          return null;
        }

        const question = typeof metadata.question === "string" ? metadata.question : fallback?.question;
        const answer = typeof metadata.answer === "string" ? metadata.answer : fallback?.answer;
        const language = typeof metadata.language === "string" ? metadata.language : fallback?.language ?? "ru";

        if (!question || !answer) {
          return null;
        }

        const text = `${question}\n\n${answer}`;

        return {
          id: match.id,
          baseScore,
          text,
          hasMetadata,
          qa: {
            id: match.id,
            question,
            answer,
            language,
          },
        };
      })
      .filter(
        (candidate): candidate is { id: string; baseScore: number; text: string; hasMetadata: boolean; qa: { id: string; question: string; answer: string; language: string } } =>
          Boolean(candidate),
      );
    
    const candidatesWithMetadata = candidates.filter((c) => c.hasMetadata);
    const candidatesWithoutMetadata = candidates.filter((c) => !c.hasMetadata);
    console.log(`[Search] Found ${candidates.length} candidates: ${candidatesWithMetadata.length} with metadata, ${candidatesWithoutMetadata.length} without metadata`);
    
    if (candidatesWithMetadata.length > 0) {
      console.log(`[Search] Using ${candidatesWithMetadata.length} candidates with metadata, filtering out ${candidatesWithoutMetadata.length} without metadata`);
      candidates.splice(0, candidates.length, ...candidatesWithMetadata);
    } else if (candidatesWithoutMetadata.length > 0) {
      console.warn(`[Search] WARNING: No candidates with metadata found! Using ${candidatesWithoutMetadata.length} candidates without metadata (from SQLite fallback). Consider running /api/qa/resync to fix this.`);
    }

    console.log(`[Search] Formed ${candidates.length} candidates from ${matches.length} matches`);
    candidates.forEach((candidate, idx) => {
      console.log(`[Search] Candidate ${idx + 1}: ID=${candidate.id}, score=${candidate.baseScore.toFixed(6)}, question="${candidate.qa.question.substring(0, 50)}..."`);
    });

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
        usage: toUsageDetails(rerankService.getUsageSummary()),
      },
    };

    const candidateById = new Map(candidates.map((c) => [c.id, c]));
    let rerankedResults: { id: string; score: number }[] = [];

    if (rerankService.isConfigured() && candidates.length > 0) {
      try {
        const rerankCandidates = candidates.map((candidate) => ({ id: candidate.id, text: candidate.text }));
        console.log(`[Search] Sending ${rerankCandidates.length} candidates to rerank in Pinecone order, top vector score: ${candidates[0]?.baseScore ?? 0}`);
        
        const rerankOutcome = await rerankService.rerank(query, rerankCandidates, topK);
        console.log(`[Search] Rerank returned ${rerankOutcome.results.length} results, model: ${rerankOutcome.model}`);
        
        pipeline.rerank.model = rerankOutcome.model;
        pipeline.rerank.attemptedModels = rerankOutcome.attemptedModels;
        pipeline.rerank.usage = rerankOutcome.usage ?? pipeline.rerank.usage;
        
        if (rerankOutcome.results.length > 0) {
          const topRerankScore = rerankOutcome.results[0]?.score ?? 0;
          const topVectorScore = candidates[0]?.baseScore ?? 0;
          
          if (topRerankScore < 0.01) {
            console.warn(`[Search] Rerank top score ${topRerankScore} too low (< 0.01), ignoring rerank and using vector scores`);
            pipeline.rerank.applied = false;
            pipeline.rerank.fallbackReason = `Rerank score ${topRerankScore} too low, using vector scores`;
          } else {
            rerankedResults = rerankOutcome.results;
            pipeline.rerank.applied = true;
            pipeline.rerank.fallbackReason = rerankOutcome.warning;
          }
        } else {
          pipeline.rerank.applied = false;
          pipeline.rerank.fallbackReason = rerankOutcome.warning ?? "Rerank returned no results";
        }
      } catch (error) {
        console.warn("Rerank failed, falling back to Pinecone scores", error);
        pipeline.rerank.applied = false;
        pipeline.rerank.fallbackReason = error instanceof Error ? error.message : "Unknown rerank failure";
        pipeline.rerank.attemptedModels = rerankService.candidateModels();
        pipeline.rerank.usage = toUsageDetails(rerankService.getUsageSummary());
      }
    }

    const results: Array<{
      id: string;
      score: number;
      vectorScore: number;
      rerankScore: number | null;
      question: string;
      answer: string;
      language: string;
    }> = [];

    if (pipeline.rerank.applied && rerankedResults.length > 0) {
      for (const reranked of rerankedResults) {
        const candidate = candidateById.get(reranked.id);
        if (!candidate) {
          console.warn(`[Search] Rerank returned ID ${reranked.id} which is not in candidates, skipping`);
          continue;
        }
        const rerankScore = typeof reranked.score === "number" && Number.isFinite(reranked.score) ? reranked.score : 0;
        results.push({
          id: candidate.qa.id,
          score: rerankScore,
          vectorScore: candidate.baseScore,
          rerankScore: rerankScore,
          question: candidate.qa.question,
          answer: candidate.qa.answer,
          language: candidate.qa.language,
        });
      }
    } else {
      for (const candidate of candidates) {
        results.push({
          id: candidate.qa.id,
          score: candidate.baseScore,
          vectorScore: candidate.baseScore,
          rerankScore: null,
          question: candidate.qa.question,
          answer: candidate.qa.answer,
          language: candidate.qa.language,
        });
      }
    }

    const finalResults = results.slice(0, topK);

    res.json({
      query,
      topK,
      matches: finalResults,
      pipeline,
    });
  } catch (error) {
    next(error);
  }
});

export const searchRouter = router;


