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
const countStmt = db.prepare("SELECT COUNT(*) as count FROM qa_pairs");

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

  create(input: { question: string; answer: string; language?: string }): QAPair {
    const id = randomUUID();
    const language = input.language ?? "ru";
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO qa_pairs (id, question, answer, language, pinecone_id, embedding_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, 'pending', ?, ?)`
    ).run(id, input.question, input.answer, language, now, now);
    return this.getById(id)!;
  },

  update(id: string, input: { question: string; answer: string; language?: string }): QAPair | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const language = input.language ?? existing.language ?? "ru";
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE qa_pairs
       SET question = ?, answer = ?, language = ?, updated_at = ?, embedding_status = 'pending'
       WHERE id = ?`
    ).run(input.question, input.answer, language, now, id);
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
      const { embedding } = await embeddingService.embed(text);
      if (!embedding || embedding.length === 0) {
        db.prepare("UPDATE qa_pairs SET embedding_status = ? WHERE id = ?").run("skipped", qa.id);
        return;
      }
      await pineconeService.upsertVector({
        id: qa.id,
        values: embedding,
        metadata: {
          question: qa.question,
          answer: qa.answer,
          language: qa.language,
        },
        namespace: "qa",
      });
      db.prepare(
        `UPDATE qa_pairs
         SET pinecone_id = ?, embedding_status = 'ready', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(qa.id, qa.id);
    } catch (error) {
      db.prepare(
        `UPDATE qa_pairs
         SET embedding_status = 'failed', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(qa.id);
      throw error;
    }
  },

  async removeVector(id: string): Promise<void> {
    if (!pineconeService.isConfigured()) return;
    await pineconeService.deleteVector(id);
  },
};


