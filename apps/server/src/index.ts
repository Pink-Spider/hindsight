// 로컬 API 서버 — Spec 생성(spec-builder), 렌더 잡 큐, (P4) 업로더가 여기 붙는다.
import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { validateSceneSpec } from "@hindsight/scene-spec";
import { buildSceneSpec, type RawSeries } from "@hindsight/spec-builder";
import { ensureData, readSeries } from "./data";
import { enqueue, getJob, openJobs } from "./jobs";
import { BGM_DIR, OUT_DIR, WEB_DIST } from "./paths";

const PORT = Number(process.env.PORT ?? 4600);
const app = new Hono();
const jobs = openJobs();

type SpecRequest = {
  tickers: { id: string; name?: string; color?: string }[];
  start: string;
  end: string;
  title: string;
  contextLine: string;
  seedKrw?: number;
  targetFps?: number;
  maxPoints?: number;
  bgm?: { track: string; gainDb?: number };
};

// assets/bgm/의 트랙 목록 — 저작권 프리 트랙(YouTube 오디오 보관함 등)을 여기 넣는다
app.get("/api/bgm", (c) => {
  if (!fs.existsSync(BGM_DIR)) return c.json({ tracks: [] });
  const tracks = fs
    .readdirSync(BGM_DIR)
    .filter((f) => /\.(mp3|m4a|wav|aac)$/i.test(f))
    .sort();
  return c.json({ tracks });
});

app.post("/api/specs", async (c) => {
  let body: SpecRequest;
  try {
    body = await c.req.json<SpecRequest>();
  } catch {
    return c.json({ error: "잘못된 JSON" }, 400);
  }
  if (!body.tickers?.length || !body.start || !body.end || !body.title || !body.contextLine) {
    return c.json({ error: "tickers, start, end, title, contextLine은 필수" }, 400);
  }
  try {
    const ids = body.tickers.map((t) => t.id.trim()).filter(Boolean);
    await ensureData(ids, body.start, body.end);
    const series: RawSeries[] = body.tickers.map((t) => {
      const s = readSeries(t.id.trim(), body.start, body.end);
      if (s.dates.length < 2) throw new Error(`${t.id}: 해당 기간 데이터 없음`);
      return { id: t.id.trim(), name: t.name?.trim() || t.id.trim(), color: t.color, ...s };
    });
    const spec = buildSceneSpec({
      series,
      targetFps: body.targetFps,
      maxPoints: body.maxPoints,
      bgm: body.bgm?.track ? body.bgm : undefined,
      meta: {
        title: body.title,
        contextLine: body.contextLine,
        seedKrw: body.seedKrw,
        dataSource: "FinanceDataReader",
      },
    });
    return c.json(spec);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

app.post("/api/renders", async (c) => {
  try {
    const body = await c.req.json<{ spec: unknown }>();
    const spec = validateSceneSpec(body.spec);
    const id = enqueue(jobs, JSON.stringify(spec));
    return c.json({ id }, 201);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

app.get("/api/renders/:id", (c) => {
  const job = getJob(jobs, Number(c.req.param("id")));
  if (!job) return c.json({ error: "없는 잡" }, 404);
  return c.json({ id: job.id, status: job.status, error: job.error, hasFile: !!job.out_path });
});

app.get("/api/renders/:id/file", (c) => {
  const job = getJob(jobs, Number(c.req.param("id")));
  if (!job?.out_path || !fs.existsSync(job.out_path)) return c.json({ error: "파일 없음" }, 404);
  const buf = fs.readFileSync(job.out_path);
  c.header("Content-Type", "video/mp4");
  c.header("Content-Disposition", `attachment; filename="${path.basename(job.out_path)}"`);
  return c.body(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
});

// 빌드된 웹 스튜디오가 있으면 정적 서빙 (docker compose 경로). 개발은 Vite 프록시 사용.
if (fs.existsSync(WEB_DIST)) {
  const root = path.relative(process.cwd(), WEB_DIST);
  app.use("/*", serveStatic({ root }));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
console.log(`API 서버: http://localhost:${PORT} (웹 정적 서빙: ${fs.existsSync(WEB_DIST) ? "on" : "off — Vite 프록시 사용"})`);
serve({ fetch: app.fetch, port: PORT });
