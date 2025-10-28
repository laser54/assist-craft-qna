import { env } from "../lib/env";
import { pineconeClient } from "./pineconeClient";

const EMBEDDING_DIMENSION_FALLBACK = 1536;

interface EmbedResult {
  embedding: number[];
  model: string;
  dimension: number;
}

const fakeEmbedding = (text: string): number[] => {
  const bytes = Buffer.from(text ?? "", "utf-8");
  const len = Math.min(bytes.length, EMBEDDING_DIMENSION_FALLBACK);
  const arr = new Array(EMBEDDING_DIMENSION_FALLBACK).fill(0);
  for (let i = 0; i < len; i++) {
    const value = bytes[i];
    if (typeof value === "number") {
      arr[i] = value / 255;
    }
  }
  return arr;
};

export const embeddingService = {
  isConfigured(): boolean {
    return env.pineconeConfigured && Boolean(env.PINECONE_EMBED_MODEL);
  },

  async embed(text: string): Promise<EmbedResult> {
    if (!this.isConfigured()) {
      return {
        embedding: fakeEmbedding(text),
        model: "local-fake",
        dimension: EMBEDDING_DIMENSION_FALLBACK,
      };
    }

    const inference = pineconeClient.getInference();
    if (!inference) {
      throw new Error("Pinecone client not initialised");
    }

    const response = await inference.embed(env.PINECONE_EMBED_MODEL!, [text], {
      inputType: env.PINECONE_EMBED_INPUT_TYPE ?? "passage",
    });

    const first = response.data?.[0];
    let embedding: number[] | undefined;
    if (first) {
      if ("values" in first && Array.isArray(first.values)) {
        embedding = first.values as number[];
      } else if ("vectorType" in first && first.vectorType === "dense" && "dense" in first) {
        const dense = first as { dense?: { values?: number[] } };
        if (dense.dense && Array.isArray(dense.dense.values)) {
          embedding = dense.dense.values;
        }
      }
    }
    if (!embedding) {
      throw new Error("Pinecone embed response missing values");
    }

    return {
      embedding,
      model: response.model ?? env.PINECONE_EMBED_MODEL!,
      dimension: embedding.length,
    };
  },
};


