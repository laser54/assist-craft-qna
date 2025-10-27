import type { IndexStatsDescription, QueryOptions, RecordMetadata, ScoredPineconeRecord } from "@pinecone-database/pinecone";
import { env } from "../lib/env";
import { pineconeClient } from "./pineconeClient";

type UpsertParams = {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
};

type QueryParams = {
  vector: number[];
  topK: number;
  namespace?: string;
};

const INDEX_NAMESPACE = "qa";

export const pineconeService = {
  isConfigured: () => env.pineconeConfigured,

  async upsertVector({ id, values, metadata }: UpsertParams): Promise<void> {
    if (!env.pineconeConfigured) return;
    const index = pineconeClient.getIndex();
    if (!index) return;
    await index.upsert([
      {
        id,
        values,
        ...(metadata ? { metadata: metadata as RecordMetadata } : {}),
      },
    ]);
  },

  async deleteVector(id: string): Promise<void> {
    if (!env.pineconeConfigured) return;
    const index = pineconeClient.getIndex();
    if (!index) return;
    await index.deleteMany({
      ids: [id],
      namespace: INDEX_NAMESPACE,
    });
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


