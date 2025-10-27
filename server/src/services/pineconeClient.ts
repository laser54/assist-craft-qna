import { Pinecone } from "@pinecone-database/pinecone";
import { env } from "../lib/env";

const client = env.pineconeConfigured
  ? new Pinecone({ apiKey: env.PINECONE_API_KEY! })
  : null;

export const pineconeClient = {
  getIndex() {
    if (!client) return null;
    if (env.PINECONE_HOST) {
      return client.Index(env.PINECONE_INDEX!, env.PINECONE_HOST);
    }
    return client.index(env.PINECONE_INDEX!);
  },

  getInference() {
    if (!client) return null;
    return client.inference;
  },
};


