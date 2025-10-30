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

export interface RerankExecution {
  model: string | null;
  results: RerankResult[];
  attemptedModels: string[];
  warning: string | null;
}

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

const getCandidateModels = (): string[] => {
  const models = [env.PINECONE_RERANK_MODEL, env.PINECONE_RERANK_FALLBACK_MODEL]
    .filter((value): value is string => Boolean(value && value.trim().length > 0));
  return unique(models);
};

const describeError = (error: unknown): string => {
  if (error == null) return "Unknown error";
  if (error instanceof Error) {
    const status = (error as any)?.status ?? (error as any)?.httpStatus ?? (error as any)?.code;
    const name = (error as any)?.name;
    const suffix = status ? ` [${status}]` : name ? ` [${name}]` : "";
    return `${error.message}${suffix}`;
  }
  if (typeof error === "object") {
    const status = (error as any)?.status ?? (error as any)?.httpStatus;
    const name = (error as any)?.name;
    const message = (error as any)?.message;
    if (message) {
      const suffix = status ? ` [${status}]` : name ? ` [${name}]` : "";
      return `${message}${suffix}`;
    }
  }
  return String(error);
};

export const rerankService = {
  isConfigured(): boolean {
    return env.pineconeConfigured && getCandidateModels().length > 0;
  },

  candidateModels(): string[] {
    return getCandidateModels();
  },

  async rerank(query: string, candidates: RerankCandidate[], topK: number): Promise<RerankExecution> {
    const attemptedModels: string[] = [];
    const modelErrors: string[] = [];

    if (!this.isConfigured()) {
      return {
        model: null,
        attemptedModels,
        results: [],
        warning: "Rerank model is not configured",
      };
    }

    const inference = pineconeClient.getInference();
    if (!inference) {
      return {
        model: null,
        attemptedModels,
        results: [],
        warning: "Pinecone inference client not initialised",
      };
    }

    const documents = candidates.map((candidate) => candidate.text);
    for (const model of getCandidateModels()) {
      attemptedModels.push(model);
      try {
        const response = await inference.rerank(model, query, documents);
        const results = (response?.data ?? [])
          .map((item) => {
            const candidate = typeof item.index === "number" ? candidates[item.index] : undefined;
            if (!candidate) return null;
            const score = typeof item.score === "number" ? item.score : 0;
            return { id: candidate.id, score };
          })
          .filter((value): value is RerankResult => Boolean(value))
          .slice(0, topK);

        if (results.length > 0) {
          return {
            model,
            attemptedModels,
            results,
            warning: modelErrors.length > 0 ? modelErrors.join(" | ") : null,
          };
        }

        modelErrors.push(`${model}: rerank returned no results`);
      } catch (error) {
        modelErrors.push(`${model}: ${describeError(error)}`);
      }
    }

    return {
      model: null,
      attemptedModels,
      results: [],
      warning: modelErrors.length > 0 ? modelErrors.join(" | ") : "All rerank models failed",
    };
  },
};


