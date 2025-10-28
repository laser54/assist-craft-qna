import { db } from "../lib/db";
import { env } from "../lib/env";

export interface AppSettings {
  topResultsCount: number;
  similarityThreshold: number;
  model: string;
  rerankModel: string | null;
  csvBatchSize: number;
}

const SETTINGS_KEY = "app_settings";

const DEFAULT_SETTINGS: AppSettings = {
  topResultsCount: 5,
  similarityThreshold: 0.3,
  model: env.PINECONE_EMBED_MODEL ?? "mixedbread-ai/mxbai-embed-xsmall-v1",
  rerankModel: env.PINECONE_RERANK_MODEL ?? null,
  csvBatchSize: env.CSV_BATCH_SIZE,
};

const getRawSettings = (): string | null => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
};

const saveRawSettings = (payload: unknown): void => {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, json(?), CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run(SETTINGS_KEY, JSON.stringify(payload));
};

const parseSettings = (raw: string | null): Partial<AppSettings> => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Partial<AppSettings>;
    }
  } catch (error) {
    console.warn("Failed to parse stored settings, falling back to defaults", error);
  }
  return {};
};

export type UpdateSettingsInput = Partial<Pick<AppSettings, "topResultsCount" | "similarityThreshold" | "model" | "rerankModel" | "csvBatchSize">>;

const clampNumber = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
};

const normalise = (settings: AppSettings): AppSettings => {
  return {
    topResultsCount: clampNumber(settings.topResultsCount, 1, 50),
    similarityThreshold: clampNumber(settings.similarityThreshold, 0, 1),
    model: settings.model.trim(),
    rerankModel: settings.rerankModel ? settings.rerankModel.trim() : null,
    csvBatchSize: clampNumber(settings.csvBatchSize, 1, 500),
  };
};

export const settingsService = {
  get(): AppSettings {
    const stored = parseSettings(getRawSettings());
    const merged: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...stored,
    };
    return normalise(merged);
  },

  update(input: UpdateSettingsInput): AppSettings {
    const current = this.get();
    const next: AppSettings = normalise({
      ...current,
      ...input,
      model: input.model ?? current.model,
      rerankModel: input.rerankModel ?? current.rerankModel,
    });
    saveRawSettings(next);
    return next;
  },
};


