// 제작 스튜디오 — 입력 폼 → Scene Spec → Renderer B 실시간 미리보기 → 렌더 잡 → mp4 다운로드.
// 미리보기와 mp4는 같은 drawScene을 쓰므로 여기서 본 것이 그대로 영상이 된다.
import React, { useEffect, useRef, useState } from "react";
import { createPlayer, type Player } from "@hindsight/renderer-canvas";
import type { SceneSpec } from "@hindsight/scene-spec";

type TickerRow = { id: string; name: string };
type JobState = { id: number; status: string; error?: string | null };

const S: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    gap: 32,
    padding: 32,
    minHeight: "100vh",
    background: "#0B0F1A",
    color: "#E8ECF4",
    fontFamily: "'Apple SD Gothic Neo', sans-serif",
    boxSizing: "border-box",
  },
  panel: { width: 460, display: "flex", flexDirection: "column", gap: 14 },
  h1: { fontSize: 22, margin: "0 0 6px" },
  label: { fontSize: 13, color: "#8A93A6", marginBottom: 4 },
  input: {
    background: "#141B2E",
    border: "1px solid #2A3346",
    borderRadius: 8,
    color: "#E8ECF4",
    padding: "10px 12px",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
  },
  row: { display: "flex", gap: 8 },
  btn: {
    background: "#5B8DEF",
    border: "none",
    borderRadius: 8,
    color: "#0B0F1A",
    padding: "12px 18px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  btnGhost: {
    background: "transparent",
    border: "1px solid #2A3346",
    borderRadius: 8,
    color: "#8A93A6",
    padding: "10px 14px",
    fontSize: 13,
    cursor: "pointer",
  },
  error: { color: "#E85D75", fontSize: 13, whiteSpace: "pre-wrap" },
  preview: { display: "flex", flexDirection: "column", gap: 12, alignItems: "center" },
  canvasBox: { border: "1px solid #2A3346", borderRadius: 16, overflow: "hidden", lineHeight: 0 },
};

export function App() {
  const [tickers, setTickers] = useState<TickerRow[]>([
    { id: "005930", name: "삼성전자" },
    { id: "SPY", name: "S&P 500" },
  ]);
  const [start, setStart] = useState("2020-01-01");
  const [end, setEnd] = useState("2024-12-31");
  const [title, setTitle] = useState("2020년, 1,000만원을 넣었다면?");
  const [contextLine, setContextLine] = useState("국민주와 미국 시장 — 같은 5년, 다른 결말");
  const [seedKrw, setSeedKrw] = useState(10_000_000);

  const [spec, setSpec] = useState<SceneSpec | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<JobState | null>(null);
  const [bgmTracks, setBgmTracks] = useState<string[]>([]);
  const [bgm, setBgm] = useState("");

  useEffect(() => {
    fetch("/api/bgm")
      .then((r) => r.json())
      .then((j) => setBgmTracks(j.tracks ?? []))
      .catch(() => setBgmTracks([]));
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Player | null>(null);

  // spec이 바뀌면 플레이어 교체 + 자동 재생
  useEffect(() => {
    if (!spec || !canvasRef.current) return;
    playerRef.current?.dispose();
    const p = createPlayer(canvasRef.current, spec);
    playerRef.current = p;
    p.play();
    return () => p.dispose();
  }, [spec]);

  // 렌더 잡 폴링
  useEffect(() => {
    if (!job || job.status === "done" || job.status === "error") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/renders/${job.id}`);
      const j = await r.json();
      setJob({ id: job.id, status: j.status, error: j.error });
    }, 2000);
    return () => clearInterval(t);
  }, [job]);

  const buildSpec = async () => {
    setBusy(true);
    setError("");
    setJob(null);
    try {
      const r = await fetch("/api/specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickers: tickers.filter((t) => t.id.trim()),
          start,
          end,
          title,
          contextLine,
          seedKrw,
          bgm: bgm ? { track: bgm } : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Spec 생성 실패");
      setSpec(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const startRender = async () => {
    if (!spec) return;
    setError("");
    try {
      const r = await fetch("/api/renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "렌더 요청 실패");
      setJob({ id: j.id, status: "queued" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const setTicker = (i: number, patch: Partial<TickerRow>) =>
    setTickers((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div style={S.page}>
      <div style={S.panel}>
        <h1 style={S.h1}>Hindsight 제작 스튜디오</h1>

        <div>
          <div style={S.label}>종목 (티커 · 표시 이름)</div>
          {tickers.map((t, i) => (
            <div key={i} style={{ ...S.row, marginBottom: 6 }}>
              <input
                style={{ ...S.input, width: 130 }}
                value={t.id}
                placeholder="005930 / NVDA"
                onChange={(e) => setTicker(i, { id: e.target.value })}
              />
              <input
                style={S.input}
                value={t.name}
                placeholder="표시 이름"
                onChange={(e) => setTicker(i, { name: e.target.value })}
              />
              <button style={S.btnGhost} onClick={() => setTickers((r) => r.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <button
            style={S.btnGhost}
            onClick={() => setTickers((r) => (r.length < 5 ? [...r, { id: "", name: "" }] : r))}
          >
            + 종목 추가 (라인 레이스 최대 5)
          </button>
        </div>

        <div style={S.row}>
          <div style={{ flex: 1 }}>
            <div style={S.label}>시작일</div>
            <input style={S.input} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={S.label}>종료일</div>
            <input style={S.input} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <div>
          <div style={S.label}>템플릿 (종목 수에 따라 제한)</div>
          <select style={S.input} value="line-race" onChange={() => undefined}>
            <option value="line-race">라인 레이스 (1~5 종목)</option>
            <option value="single" disabled>
              단일 종목 레이아웃 — P3
            </option>
            <option value="bar-race" disabled>
              바 차트 레이스 (8~15 종목) — P3
            </option>
          </select>
        </div>

        <div>
          <div style={S.label}>타이틀 (훅)</div>
          <input style={S.input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <div style={S.label}>맥락 한 줄 (필수 — 유튜브 정책 대응, 엔딩·설명에 들어감)</div>
          <input style={S.input} value={contextLine} onChange={(e) => setContextLine(e.target.value)} />
        </div>
        <div>
          <div style={S.label}>배경음악 (렌더 mp4에만 적용 — assets/bgm/에 파일 추가)</div>
          <select style={S.input} value={bgm} onChange={(e) => setBgm(e.target.value)}>
            <option value="">없음</option>
            {bgmTracks.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={S.label}>투자 원금 (₩)</div>
          <input
            style={S.input}
            type="number"
            value={seedKrw}
            step={1_000_000}
            onChange={(e) => setSeedKrw(Number(e.target.value))}
          />
        </div>

        <div style={S.row}>
          <button style={{ ...S.btn, flex: 1 }} onClick={buildSpec} disabled={busy}>
            {busy ? "데이터 준비 중…" : "미리보기"}
          </button>
          <button
            style={{ ...S.btn, flex: 1, background: spec ? "#76B900" : "#2A3346" }}
            onClick={startRender}
            disabled={!spec || (job !== null && job.status !== "done" && job.status !== "error")}
          >
            렌더 (mp4)
          </button>
        </div>

        {error && <div style={S.error}>⚠ {error}</div>}
        {job && (
          <div style={{ fontSize: 14, color: "#8A93A6" }}>
            렌더 잡 #{job.id}: <b style={{ color: "#E8ECF4" }}>{job.status}</b>
            {job.status === "error" && <div style={S.error}>{job.error}</div>}
            {job.status === "done" && (
              <>
                {" · "}
                <a href={`/api/renders/${job.id}/file`} style={{ color: "#5B8DEF" }}>
                  mp4 다운로드
                </a>
              </>
            )}
            {job.status === "queued" && " (큐 워커 실행 중인지 확인: pnpm queue)"}
          </div>
        )}
      </div>

      <div style={S.preview}>
        <div style={S.canvasBox}>
          <canvas ref={canvasRef} width={540} height={960} style={{ width: 405, height: 720 }} />
        </div>
        <div style={S.row}>
          <button style={S.btnGhost} onClick={() => playerRef.current?.play()}>
            ▶ 재생
          </button>
          <button style={S.btnGhost} onClick={() => playerRef.current?.pause()}>
            ⏸ 일시정지
          </button>
          <button style={S.btnGhost} onClick={() => playerRef.current?.restart()}>
            ⟲ 처음부터
          </button>
        </div>
        {!spec && <div style={{ color: "#8A93A6", fontSize: 14 }}>미리보기를 누르면 여기서 재생됩니다</div>}
      </div>
    </div>
  );
}
