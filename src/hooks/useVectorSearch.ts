import { useState, useEffect } from "react";
import { pipeline } from "@huggingface/transformers";
import type { QAPair } from "@/pages/QAManagement";
import type { Settings } from "@/pages/Settings";

interface SearchResult extends QAPair {
  score: number;
}

export const useVectorSearch = () => {
  const [isReady, setIsReady] = useState(false);
  const [extractor, setExtractor] = useState<any>(null);

  useEffect(() => {
    const initModel = async () => {
      try {
        const settingsStr = localStorage.getItem("faq-settings");
        const settings: Settings = settingsStr ? JSON.parse(settingsStr) : {
          model: "mixedbread-ai/mxbai-embed-xsmall-v1"
        };

        const model = await pipeline(
          "feature-extraction",
          settings.model,
          { device: "webgpu" }
        );
        setExtractor(model);
        setIsReady(true);
      } catch (error) {
        console.error("Error initializing model:", error);
      }
    };

    initModel();
  }, []);

  const search = async (query: string): Promise<SearchResult[]> => {
    if (!extractor || !query.trim()) return [];

    const qaPairsStr = localStorage.getItem("faq-qa-pairs");
    if (!qaPairsStr) return [];

    const qaPairs: QAPair[] = JSON.parse(qaPairsStr);
    if (qaPairs.length === 0) return [];

    const settingsStr = localStorage.getItem("faq-settings");
    const settings: Settings = settingsStr ? JSON.parse(settingsStr) : {
      topResultsCount: 5,
      similarityThreshold: 0.3
    };

    const queryEmbedding = await extractor(query, { pooling: "mean", normalize: true });
    const queryVector = Array.from(queryEmbedding.data) as number[];

    const results: SearchResult[] = [];

    for (const pair of qaPairs) {
      const questionEmbedding = await extractor(pair.question, { pooling: "mean", normalize: true });
      const questionVector = Array.from(questionEmbedding.data) as number[];

      const similarity = cosineSimilarity(queryVector, questionVector);

      if (similarity >= settings.similarityThreshold) {
        results.push({
          ...pair,
          score: similarity,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, settings.topResultsCount);
  };

  return { search, isReady };
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}