// 계약 ①의 읽기 쪽 + 부족한 데이터의 자동 적재 (Python collector 호출).
import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import { CACHE_DB, INGEST, PYTHON, REPO_ROOT } from "./paths";

const execFileAsync = promisify(execFile);

const STALE_DAYS = 5; // 주말·휴장 여유

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

export async function ensureData(symbols: string[], start: string, end: string): Promise<void> {
  const need = new Set<string>();
  if (!fs.existsSync(CACHE_DB)) {
    symbols.forEach((s) => need.add(s));
  } else {
    const db = new Database(CACHE_DB, { readonly: true });
    const q = db.prepare("SELECT MIN(date) mn, MAX(date) mx FROM prices WHERE ticker = ?");
    for (const sym of symbols) {
      const row = q.get(sym) as { mn: string | null; mx: string | null };
      if (!row?.mx || !row.mn) need.add(sym);
      else if (row.mx < end && daysBetween(row.mx, end) > STALE_DAYS) need.add(sym); // 최신 구간 부족
      else if (start < row.mn && daysBetween(start, row.mn) > 40) need.add(sym); // 과거 구간 부족 (상장일 이전 요청이면 새 행 없이 끝남)
    }
    db.close();
  }
  if (need.size === 0) return;

  const list = [...need];
  console.log(`자동 적재: ${list.join(", ")} (start=${start})`);
  await execFileAsync(PYTHON, [INGEST, ...list, "--start", start], {
    cwd: REPO_ROOT,
    timeout: 120_000,
  });
}

export function readSeries(ticker: string, start: string, end: string): { dates: string[]; values: number[] } {
  const db = new Database(CACHE_DB, { readonly: true, fileMustExist: true });
  const rows = db
    .prepare(
      "SELECT date, adj_close FROM prices WHERE ticker = ? AND date >= ? AND date <= ? ORDER BY date"
    )
    .all(ticker, start, end) as { date: string; adj_close: number }[];
  db.close();
  return { dates: rows.map((r) => r.date), values: rows.map((r) => r.adj_close) };
}
