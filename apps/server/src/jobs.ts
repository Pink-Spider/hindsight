// 렌더 잡 큐 — SQLite 테이블 + 폴링 (ADR-001: 1인 로컬 도구에는 이걸로 충분).
// 이 테이블은 TS(server/worker) 소유. 계약 ①의 prices/fx_rates와 별도 파일에 둔다.
import Database from "better-sqlite3";
import { JOBS_DB } from "./paths";

export type RenderJob = {
  id: number;
  spec_json: string;
  status: "queued" | "running" | "done" | "error";
  out_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string | null;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS render_jobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  spec_json  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'queued',
  out_path   TEXT,
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
`;

export function openJobs(): Database.Database {
  const db = new Database(JOBS_DB);
  db.exec(SCHEMA);
  return db;
}

export function enqueue(db: Database.Database, specJson: string): number {
  const r = db.prepare("INSERT INTO render_jobs (spec_json) VALUES (?)").run(specJson);
  return Number(r.lastInsertRowid);
}

export function getJob(db: Database.Database, id: number): RenderJob | undefined {
  return db.prepare("SELECT * FROM render_jobs WHERE id = ?").get(id) as RenderJob | undefined;
}
