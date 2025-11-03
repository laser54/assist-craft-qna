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
    const scoped = index.namespace(namespace ?? env.PINECONE_NAMESPACE);
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
    const scoped = index.namespace(env.PINECONE_NAMESPACE);
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
    const scoped = index.namespace(env.PINECONE_NAMESPACE);
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
    const scopedIndex = index.namespace(namespace ?? env.PINECONE_NAMESPACE);
    const params: QueryOptions = {
      vector,
      topK,
      includeMetadata: true,
      includeValues: false,
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

  async deleteAllVectors(namespace?: string): Promise<void> {
    if (!env.pineconeConfigured) return;
    const index = pineconeClient.getIndex();
    if (!index) return;
    const targetNamespace = namespace ?? env.PINECONE_NAMESPACE;
    const scoped = index.namespace(targetNamespace);
    try {
      await scoped.deleteAll();
      console.log(`[Pinecone] Deleted all vectors from namespace: ${targetNamespace}`);
    } catch (error) {
      if (isNotFoundError(error)) {
        console.log(`[Pinecone] Namespace ${targetNamespace} is already empty`);
        return;
      }
      throw error;
    }
  },
};


