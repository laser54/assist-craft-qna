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
  usage: RerankUsageDetails | null;
}

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

export interface RerankUsageAggregate {
  date: string;
  unitsUsed: number;
  limit: number | null;
  remaining: number | null;
}

export interface RerankUsageDetails extends RerankUsageAggregate {
  lastCallUnits: number;
}

const usageState: { date: string; unitsUsed: number } = {
  date: new Date().toISOString().slice(0, 10),
  unitsUsed: 0,
};

const ensureUsageDate = () => {
  const today = new Date().toISOString().slice(0, 10);
  if (usageState.date !== today) {
    usageState.date = today;
    usageState.unitsUsed = 0;
  }
};

const getRerankLimit = (): number | null => env.pineconeRerankDailyLimit ?? null;

const recordUsage = (units: number): RerankUsageDetails => {
  ensureUsageDate();
  const increment = Number.isFinite(units) && units > 0 ? Math.round(units) : 0;
  usageState.unitsUsed += increment;
  const limit = getRerankLimit();
  const remaining = limit != null ? Math.max(limit - usageState.unitsUsed, 0) : null;
  return {
    date: usageState.date,
    unitsUsed: usageState.unitsUsed,
    limit,
    remaining,
    lastCallUnits: increment,
  };
};

const currentUsage = (): RerankUsageAggregate => {
  ensureUsageDate();
  const limit = getRerankLimit();
  const remaining = limit != null ? Math.max(limit - usageState.unitsUsed, 0) : null;
  return {
    date: usageState.date,
    unitsUsed: usageState.unitsUsed,
    limit,
    remaining,
  };
};

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
    let usageDetails: RerankUsageDetails | null = null;

    if (!this.isConfigured()) {
      return {
        model: null,
        attemptedModels,
        results: [],
        warning: "Rerank model is not configured",
        usage: null,
      };
    }

    const inference = pineconeClient.getInference();
    if (!inference) {
      return {
        model: null,
        attemptedModels,
        results: [],
        warning: "Pinecone inference client not initialised",
        usage: null,
      };
    }

    const documents = candidates.map((candidate) => candidate.text);
    console.log(`[Rerank] Processing ${candidates.length} candidates, query: "${query.substring(0, 50)}..."`);
    console.log(`[Rerank] First candidate ID: ${candidates[0]?.id}, text preview: "${candidates[0]?.text.substring(0, 50)}..."`);
    
    for (const model of getCandidateModels()) {
      attemptedModels.push(model);
      try {
        const response = await inference.rerank(model, query, documents);
        const units = typeof (response as any)?.usage?.rerankUnits === "number" ? (response as any).usage.rerankUnits : 0;
        usageDetails = recordUsage(units);
        const results = (response?.data ?? [])
          .map((item) => {
            const candidate = typeof item.index === "number" && item.index >= 0 && item.index < candidates.length
              ? candidates[item.index]
              : undefined;
            if (!candidate) {
              console.warn(`[Rerank] Invalid index ${item.index} for ${candidates.length} candidates`);
              return null;
            }
            const score = typeof item.score === "number" && Number.isFinite(item.score) ? item.score : 0;
            return { id: candidate.id, score };
          })
          .filter((value): value is RerankResult => Boolean(value))
          .slice(0, topK);
        
        console.log(`[Rerank] Model ${model} returned ${results.length} results, top score: ${results[0]?.score ?? 0}, top ID: ${results[0]?.id ?? "none"}`);

        if (results.length > 0) {
          return {
            model,
            attemptedModels,
            results,
            warning: modelErrors.length > 0 ? modelErrors.join(" | ") : null,
            usage: usageDetails,
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
      usage: usageDetails,
    };
  },

  getUsageSummary(): RerankUsageAggregate {
    return currentUsage();
  },
};


