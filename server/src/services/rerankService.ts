import { env } from "../lib/env";
import { pineconeClient } from "./pineconeClient";

export interface RerankCandidate {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface RerankResult {
  id: string;
  score: number;
}

const FALLBACK_WEIGHT = 0.9;

export const rerankService = {
  isConfigured(): boolean {
    return env.pineconeConfigured && Boolean(env.PINECONE_RERANK_MODEL);
  },

  async rerank(query: string, candidates: RerankCandidate[], topK: number): Promise<RerankResult[]> {
    if (!this.isConfigured()) {
      return candidates
        .map((candidate, index) => ({
          id: candidate.id,
          score: Math.max(0, 1 - index * (1 - FALLBACK_WEIGHT) / Math.max(1, candidates.length - 1)),
        }))
        .slice(0, topK);
    }

    const inference = pineconeClient.getInference();
    if (!inference) {
      throw new Error("Pinecone inference client not initialised");
    }

    const response = await inference.rerank(
      env.PINECONE_RERANK_MODEL!,
      query,
      candidates.map((candidate) => candidate.text),
    );

    const results = response?.data ?? [];
    return results.map((item, index) => ({
      id: candidates[index]?.id ?? String(index),
      score: typeof item.score === "number" ? item.score : 0,
    }));
  },
};


