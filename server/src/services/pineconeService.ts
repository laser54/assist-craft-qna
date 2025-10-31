import type { IndexStatsDescription, QueryOptions, RecordMetadata, ScoredPineconeRecord } from "@pinecone-database/pinecone";
import { env } from "../lib/env";
import { pineconeClient } from "./pineconeClient";

type UpsertParams = {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
  namespace?: string;
};

type QueryParams = {
  vector: number[];
  topK: number;
  namespace?: string;
};

const INDEX_NAMESPACE = "qa";

const isNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const name = (error as any)?.name;
  const status = (error as any)?.status ?? (error as any)?.httpStatus;
  return name === "PineconeNotFoundError" || status === 404;
};

export const pineconeService = {
  isConfigured: () => env.pineconeConfigured,

  async upsertVector({ id, values, metadata, namespace }: UpsertParams): Promise<void> {
    if (!env.pineconeConfigured) return;
    const index = pineconeClient.getIndex();
    if (!index) return;
    const scoped = namespace ? index.namespace(namespace) : index.namespace(INDEX_NAMESPACE);
    await scoped.upsert([{
      id,
      values,
      ...(metadata ? { metadata: metadata as RecordMetadata } : {}),
    }]);
  },

  async deleteVector(id: string): Promise<void> {
    if (!env.pineconeConfigured) return;
    const index = pineconeClient.getIndex();
    if (!index) return;
    const scoped = index.namespace(INDEX_NAMESPACE);
    try {
      await scoped.deleteMany([id]);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  },

  async deleteVectors(ids: string[]): Promise<void> {
    if (!env.pineconeConfigured) return;
    if (ids.length === 0) return;
    const index = pineconeClient.getIndex();
    if (!index) return;
    const scoped = index.namespace(INDEX_NAMESPACE);
    try {
      await scoped.deleteMany(ids);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  },

  async query({ vector, topK, namespace }: QueryParams): Promise<ScoredPineconeRecord[]> {
    if (!env.pineconeConfigured) return [];
    const index = pineconeClient.getIndex();
    if (!index) return [];
    const scopedIndex = namespace ? index.namespace(namespace) : index.namespace(INDEX_NAMESPACE);
    const params: QueryOptions = {
      vector,
      topK,
    };
    const result = await scopedIndex.query(params);
    return result.matches ?? [];
  },

  async describeIndexStats(): Promise<IndexStatsDescription | null> {
    if (!env.pineconeConfigured) return null;
    const index = pineconeClient.getIndex();
    if (!index) return null;
    return index.describeIndexStats();
  },
};


