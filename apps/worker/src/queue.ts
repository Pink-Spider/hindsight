// 큐 소비 워커 — render_jobs 폴링(2초) → Remotion 렌더 → 상태 갱신.
// 사용: pnpm queue  (레포 루트)
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { validateSceneSpec } from "@hindsight/scene-spec";
import { REPO_ROOT, renderSpec } from "./render-core";

const JOBS_DB = path.join(REPO_ROOT, "data", "jobs.db");
const OUT_DIR = path.join(REPO_ROOT, "out");
const POLL_MS = 2000;

const db = new Database(JOBS_DB);
db.exec(`
CREATE TABLE IF NOT EXISTS render_jobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  spec_json  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'queued',
  out_path   TEXT,
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);`);

const claim = db.prepare(`
  UPDATE render_jobs SET status = 'running', updated_at = datetime('now')
  WHERE id = (SELECT id FROM render_jobs WHERE status = 'queued' ORDER BY id LIMIT 1)
  RETURNING id, spec_json`);
const finish = db.prepare(
  "UPDATE render_jobs SET status = ?, out_path = ?, error = ?, updated_at = datetime('now') WHERE id = ?"
);

async function processOne(): Promise<boolean> {
  const row = claim.get() as { id: number; spec_json: string } | undefined;
  if (!row) return false;
  console.log(`잡 #${row.id} 시작`);
  try {
    const spec = validateSceneSpec(JSON.parse(row.spec_json));
    const out = path.join(OUT_DIR, `job_${row.id}.mp4`);
    let lastPct = -1;
    await renderSpec(spec, out, (rendered, total) => {
      const pct = Math.floor((rendered / total) * 10) * 10;
      if (pct > lastPct) {
        lastPct = pct;
        console.log(`  잡 #${row.id}: ${pct}%`);
      }
    });
    finish.run("done", out, null, row.id);
    console.log(`잡 #${row.id} 완료 → ${out}`);
  } catch (e) {
    finish.run("error", null, e instanceof Error ? e.message : String(e), row.id);
    console.error(`잡 #${row.id} 실패:`, e);
  }
  return true;
}

async function loop() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`큐 워커 시작 (폴링 ${POLL_MS}ms) — ${JOBS_DB}`);
  for (;;) {
    const worked = await processOne().catch((e) => {
      console.error("워커 오류:", e);
      return false;
    });
    if (!worked) await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

loop();
