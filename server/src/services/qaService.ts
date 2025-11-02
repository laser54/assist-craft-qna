import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { embeddingService } from "./embeddingService";
import { pineconeService } from "./pineconeService";

export interface QAPair {
  id: string;
  question: string;
  answer: string;
  language: string;
  pinecone_id: string | null;
  embedding_status: string;
  created_at: string;
  updated_at: string;
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface ListResult {
  total: number;
  page: number;
  pageSize: number;
  items: QAPair[];
}

const DEFAULT_PAGE_SIZE = 20;

const mapRow = (row: any): QAPair => ({
  id: row.id,
  question: row.question,
  answer: row.answer,
  language: row.language,
  pinecone_id: row.pinecone_id,
  embedding_status: row.embedding_status,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const selectByIdStmt = db.prepare("SELECT * FROM qa_pairs WHERE id = ?");
const selectByQuestionStmt = db.prepare(
  "SELECT * FROM qa_pairs WHERE TRIM(LOWER(question)) = TRIM(LOWER(?)) LIMIT 1",
);
const countStmt = db.prepare("SELECT COUNT(*) as count FROM qa_pairs");
const listIdsStmt = db.prepare("SELECT id, pinecone_id FROM qa_pairs");

const buildSearchClause = (search?: string) => {
  if (!search?.trim()) {
    return { where: "", params: [] as unknown[] };
  }
  const term = `%${search.trim()}%`;
  return {
    where: "WHERE question LIKE ? OR answer LIKE ?",
    params: [term, term],
  };
};

const listQuery = (search?: string, page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
  const offset = (page - 1) * pageSize;
  const { where, params } = buildSearchClause(search);
  const sql = `${
    "SELECT * FROM qa_pairs"
  } ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
  return db.prepare(sql).all(...params, pageSize, offset).map(mapRow);
};

const normaliseQuestion = (value: string) => value.trim();
const normaliseAnswer = (value: string) => value.trim();

export interface CreateResult {
  record: QAPair;
  replaced: boolean;
}

export const qaService = {
  list(options: ListOptions = {}): ListResult {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, 100));
    const { where, params } = buildSearchClause(options.search);
    const total = db.prepare(`SELECT COUNT(*) as count FROM qa_pairs ${where}`).get(...params) as { count: number };
    const items = listQuery(options.search, page, pageSize);
    return {
      total: total.count,
      page,
      pageSize,
      items,
    };
  },

  getById(id: string): QAPair | null {
    const row = selectByIdStmt.get(id);
    if (!row) return null;
    return mapRow(row);
  },

  getByQuestion(question: string): QAPair | null {
    const row = selectByQuestionStmt.get(question);
    if (!row) return null;
    return mapRow(row);
  },

  create(input: { question: string; answer: string; language?: string }): CreateResult {
    const question = normaliseQuestion(input.question);
    const answer = normaliseAnswer(input.answer);
    const language = input.language ?? "ru";
    const existing = this.getByQuestion(question);
    const now = new Date().toISOString();

    if (existing) {
      db.prepare(
        `UPDATE qa_pairs
         SET question = ?, answer = ?, language = ?, updated_at = ?, embedding_status = 'pending'
         WHERE id = ?`
      ).run(question, answer, language, now, existing.id);
      return {
        record: this.getById(existing.id)!,
        replaced: true,
      };
    }

    const id = randomUUID();
    db.prepare(
      `INSERT INTO qa_pairs (id, question, answer, language, pinecone_id, embedding_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, 'pending', ?, ?)`
    ).run(id, question, answer, language, now, now);
    return {
      record: this.getById(id)!,
      replaced: false,
    };
  },

  update(id: string, input: { question: string; answer: string; language?: string }): QAPair | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const question = normaliseQuestion(input.question);
    const answer = normaliseAnswer(input.answer);
    const language = input.language ?? existing.language ?? "ru";
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE qa_pairs
       SET question = ?, answer = ?, language = ?, updated_at = ?, embedding_status = 'pending'
       WHERE id = ?`
    ).run(question, answer, language, now, id);
    return this.getById(id);
  },

  delete(id: string): boolean {
    const result = db.prepare("DELETE FROM qa_pairs WHERE id = ?").run(id);
    return result.changes > 0;
  },

  count(): number {
    const row = countStmt.get() as { count: number } | undefined;
    return row?.count ?? 0;
  },

  findByIds(ids: string[]): QAPair[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const rows = db.prepare(`SELECT * FROM qa_pairs WHERE id IN (${placeholders})`).all(...ids);
    return rows.map(mapRow);
  },

  searchByText(query: string, limit = 10): QAPair[] {
    const { where, params } = buildSearchClause(query);
    const rows = db
      .prepare(`SELECT * FROM qa_pairs ${where} ORDER BY updated_at DESC LIMIT ?`)
      .all(...params, limit);
    return rows.map(mapRow);
  },

  async syncVector(qa: QAPair): Promise<void> {
    try {
      const text = `${qa.question}\n\n${qa.answer}`;
      console.log(`[syncVector] Syncing QA ${qa.id}, question: "${qa.question.substring(0, 50)}..."`);
      const { embedding, model } = await embeddingService.embed(text);
      console.log(`[syncVector] Embedding model: ${model}, dimension: ${embedding.length}`);
      if (!embedding || embedding.length === 0) {
        console.warn(`[syncVector] No embedding for QA ${qa.id}, skipping`);
        db.prepare("UPDATE qa_pairs SET embedding_status = ? WHERE id = ?").run("skipped", qa.id);
        return;
      }
      const metadata = {
        question: qa.question,
        answer: qa.answer,
        language: qa.language,
      };
      console.log(`[syncVector] Upserting to Pinecone with metadata:`, JSON.stringify(metadata, null, 2));
      await pineconeService.upsertVector({
        id: qa.id,
        values: embedding,
        metadata,
        namespace: "qa",
      });
      
      await new Promise((resolve) => setTimeout(resolve, 300));
      
      console.log(`[syncVector] Successfully synced QA ${qa.id} to Pinecone (id=${qa.id}, has metadata: question="${metadata.question?.substring(0, 30)}...", answer length=${metadata.answer?.length ?? 0})`);
      db.prepare(
        `UPDATE qa_pairs
         SET pinecone_id = ?, embedding_status = 'ready', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(qa.id, qa.id);
    } catch (error) {
      console.error(`[syncVector] Failed to sync QA ${qa.id}:`, error);
      db.prepare(
        `UPDATE qa_pairs
         SET embedding_status = 'failed', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(qa.id);
      throw error;
    }
  },

  async syncVectorWithRetry(qa: QAPair, maxAttempts = 3): Promise<void> {
    let syncAttempts = 0;
    let syncSuccess = false;
    const qaId = qa.id;
    
    while (syncAttempts < maxAttempts && !syncSuccess) {
      syncAttempts += 1;
      try {
        await this.syncVector(qa);
        console.log(`[syncVectorWithRetry] Successfully synced QA ${qaId} to Pinecone (attempt ${syncAttempts})`);
        syncSuccess = true;
      } catch (error) {
        console.error(`[syncVectorWithRetry] Failed to sync Pinecone for QA ${qaId} (attempt ${syncAttempts}/${maxAttempts}):`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[syncVectorWithRetry] Error details:`, errorMessage);
        
        if (syncAttempts < maxAttempts) {
          const delay = syncAttempts * 1000;
          console.log(`[syncVectorWithRetry] Retrying sync in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          qa = this.getById(qaId)!;
          if (!qa) {
            throw new Error(`QA ${qaId} not found after retry delay`);
          }
        } else {
          console.error(`[syncVectorWithRetry] All ${maxAttempts} sync attempts failed for QA ${qaId}`);
          throw error;
        }
      }
    }
  },

  async removeVector(qa: QAPair): Promise<{ removed: boolean; skipped: boolean; error?: string }> {
    if (!pineconeService.isConfigured()) {
      return { removed: false, skipped: true };
    }
    const vectorId = qa.pinecone_id ?? qa.id;
    if (!vectorId) {
      return { removed: false, skipped: true };
    }
    try {
      await pineconeService.deleteVector(vectorId);
      return { removed: true, skipped: false };
    } catch (error) {
      console.warn("Failed to remove Pinecone vector", vectorId, error);
      return {
        removed: false,
        skipped: false,
        error: error instanceof Error ? error.message : "Unknown Pinecone error",
      };
    }
  },

  async deleteAll(): Promise<{ deleted: number; vectorFailures: string[] }> {
    const rows = listIdsStmt.all() as { id: string; pinecone_id: string | null }[];
    const vectorIds = rows
      .map((row) => row.pinecone_id ?? row.id)
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    const vectorFailures: string[] = [];

    if (vectorIds.length > 0 && pineconeService.isConfigured()) {
      try {
        await pineconeService.deleteVectors(vectorIds);
      } catch (error) {
        console.error("Failed to delete Pinecone vectors in bulk", error);
        vectorFailures.push(...vectorIds);
      }
    }

    const info = db.prepare("DELETE FROM qa_pairs").run();
    return {
      deleted: typeof info.changes === "number" ? info.changes : rows.length,
      vectorFailures,
    };
  },

  async resyncAll(): Promise<{ total: number; synced: number; failed: number; errors: string[] }> {
    console.log(`[resyncAll] Starting resync - clearing Pinecone namespace first`);
    try {
      await pineconeService.deleteAllVectors("qa");
      console.log(`[resyncAll] Pinecone namespace cleared`);
    } catch (error) {
      console.error(`[resyncAll] Failed to clear Pinecone namespace:`, error);
    }

    const allRows = db.prepare("SELECT * FROM qa_pairs ORDER BY updated_at DESC").all();
    const allQa = allRows.map(mapRow);
    const total = allQa.length;
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    console.log(`[resyncAll] Starting resync of ${total} QA pairs`);

    for (const qa of allQa) {
      try {
        await this.syncVectorWithRetry(qa);
        synced += 1;
        if (synced % 10 === 0) {
          console.log(`[resyncAll] Progress: ${synced}/${total} synced`);
        }
      } catch (error) {
        failed += 1;
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`QA ${qa.id}: ${errorMsg}`);
        console.error(`[resyncAll] Failed to sync QA ${qa.id}:`, error);
      }
    }

    console.log(`[resyncAll] Completed: ${synced} synced, ${failed} failed out of ${total} total`);

    return {
      total,
      synced,
      failed,
      errors: errors.slice(0, 50),
    };
  },
};


