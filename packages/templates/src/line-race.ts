// 라인 레이스 템플릿 — P0(p0/render.py)에서 검증한 연출 로직의 이식.
// 확정 파라미터: 완급 warp(Spec 필드), y축 EMA τ0.6s + 클램프, 비대칭 패딩 7%/2%, ₩+% 병기.
import type { SceneSpec } from "@hindsight/scene-spec";
import type { ChartPoint, SceneState, Timeline } from "./types";

const BG = "#0B0F1A";
const YLIM_TAU_SEC = 0.6;
const PAD_TOP = 0.07;
const PAD_BOT = 0.02;
const X_HEADROOM = 1.14; // x축 오른쪽 여백 = 라인 헤드 배지 자리

function timeWarp(p: number, warp: number): number {
  const easeOut = 1 - (1 - p) ** 2;
  return (1 - warp) * p + warp * easeOut;
}

function interpAt(arr: number[], x: number): number {
  const k = Math.floor(x);
  if (k >= arr.length - 1) return arr[arr.length - 1];
  const t = x - k;
  return arr[k] * (1 - t) + arr[k + 1] * t;
}

export function fmtKrw(v: number): string {
  const n = Math.round(v);
  const eok = Math.floor(n / 100_000_000);
  const man = Math.round((n % 100_000_000) / 10_000);
  if (eok > 0) {
    return man > 0
      ? `${eok.toLocaleString("ko-KR")}억 ${man.toLocaleString("ko-KR")}만원`
      : `${eok.toLocaleString("ko-KR")}억원`;
  }
  return `${man.toLocaleString("ko-KR")}만원`;
}

function fmtPct(v: number, digits: number): string {
  const sign = v >= 0 ? "+" : "-";
  return `${sign}${Math.abs(v).toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

// 목표 개수(±)에 가장 가까운 nice step 선택. 최소 5%p — 레이스 초반 범위가 1~2%p로
// 좁을 때 라벨이 전부 "+0%"로 뭉치는 것을 막는다 (중복 라벨 = 렌더러 key 충돌 원인).
function tickStep(range: number, target: number): number {
  const k0 = Math.floor(Math.log10(Math.max(range / target, 1e-9)));
  let best = 5;
  let bestScore = Infinity;
  for (const k of [k0, k0 + 1]) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = Math.max(m * 10 ** k, 5);
      const count = Math.floor(range / step) + 1;
      const score = Math.abs(count - target) + (count < 2 ? 10 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = step;
      }
    }
  }
  return best;
}

function ticksBetween(lo: number, hi: number, target = 5): number[] {
  const step = tickStep(hi - lo, target);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

function splitTitle(title: string): string[] {
  const words = title.split(" ");
  if (words.length <= 3) return words;
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

export function createLineRaceTimeline(spec: SceneSpec): Timeline {
  const fps = spec.targetFps;
  const { warp } = spec.timeline;
  const nHook = Math.round(spec.timeline.hookSec * fps);
  const nRace = Math.round(spec.timeline.raceSec * fps);
  const nEnd = Math.round(spec.timeline.endSec * fps);
  const totalFrames = nHook + nRace + nEnd;

  const time = spec.axis.time;
  const N = time.length;
  const S = spec.series.length;
  const vals = spec.series.map((s) => s.values);

  // 러닝 극값 (y축 확장 목표)
  const runmax = new Array<number>(N);
  const runmin = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    let mx = -Infinity;
    let mn = Infinity;
    for (let s = 0; s < S; s++) {
      mx = Math.max(mx, vals[s][i]);
      mn = Math.min(mn, vals[s][i]);
    }
    runmax[i] = i === 0 ? mx : Math.max(runmax[i - 1], mx);
    runmin[i] = i === 0 ? mn : Math.min(runmin[i - 1], mn);
  }

  // 레이스 프레임별 사전 계산: 데이터 위치 x, y축 범위(EMA + 클램프)
  // 순차 의존 계산은 여기서 끝낸다 — stateAt은 순수 조회 (ADR-002 결정 4)
  const alpha = 1 - Math.exp(-1 / (fps * YLIM_TAU_SEC));
  const xArr = new Array<number>(nRace);
  const topArr = new Array<number>(nRace);
  const botArr = new Array<number>(nRace);
  let top = 0;
  let bot = 0;
  for (let f = 0; f < nRace; f++) {
    const p = nRace === 1 ? 1 : f / (nRace - 1);
    const x = timeWarp(p, warp) * (N - 1);
    const tmax = interpAt(runmax, x);
    const tmin = interpAt(runmin, x);
    const rng = tmax - tmin + 1e-9;
    const tTop = tmax + rng * PAD_TOP;
    const tBot = tmin - rng * PAD_BOT;
    if (f === 0) {
      top = tTop;
      bot = tBot;
    } else {
      top += alpha * (tTop - top);
      bot += alpha * (tBot - bot);
    }
    let curMax = -Infinity;
    let curMin = Infinity;
    for (let s = 0; s < S; s++) {
      const cv = interpAt(vals[s], x);
      curMax = Math.max(curMax, cv);
      curMin = Math.min(curMin, cv);
    }
    top = Math.max(top, curMax + rng * 0.02);
    bot = Math.min(bot, curMin - rng * 0.01);
    xArr[f] = x;
    topArr[f] = top;
    botArr[f] = bot;
  }

  // 연도 눈금 (x축)
  const yearTicks: { i: number; label: string }[] = [];
  for (let i = 1; i < N; i++) {
    if (time[i].slice(0, 4) !== time[i - 1].slice(0, 4)) {
      yearTicks.push({ i, label: time[i].slice(0, 4) });
    }
  }

  const names = spec.series.map((s) => s.name);
  const yearRange = `${time[0].slice(0, 4)}–${time[N - 1].slice(0, 4)}`;
  const subtitle = `${names.join(" vs ")} · ${yearRange}`;
  const footnote =
    `수정주가 · ${spec.meta.returnType === "price" ? "가격수익률 기준(배당 재투자 미반영)" : "총수익률(배당 재투자) 기준"}` +
    ` · 데이터: ${spec.meta.dataSource}`;
  const xNorm = (i: number) => i / ((N - 1) * X_HEADROOM);

  const stateAt = (frame: number): SceneState => {
    if (frame < nHook) {
      return {
        phase: "hook",
        background: BG,
        hook: { titleLines: splitTitle(spec.meta.title), subtitle: names.join(" vs ") },
        footnote,
      };
    }

    const rf = Math.min(frame - nHook, nRace - 1);
    const x = xArr[rf];
    const t = topArr[rf];
    const b = botArr[rf];
    const k = Math.floor(x);
    const yNorm = (v: number) => (v - b) / (t - b);

    const cur = vals.map((vs) => interpAt(vs, x));
    const series = spec.series.map((s, si) => {
      const pts: ChartPoint[] = [];
      for (let i = 0; i <= k; i++) pts.push({ x: xNorm(i), y: yNorm(vals[si][i]) });
      const head: ChartPoint = { x: x / ((N - 1) * X_HEADROOM), y: yNorm(cur[si]) };
      pts.push(head);
      return {
        id: s.id,
        color: s.color,
        points: pts,
        head,
        // KR 숫자 코드는 배지에 이름을 쓴다 — "005930"보다 "삼성전자"가 읽힌다
        badge: {
          text: `${/^\d{6}$/.test(s.id) ? s.name : s.id} ${fmtPct(cur[si] - 100, 0)}`,
          dir: (si % 2 === 0 ? 1 : -1) as 1 | -1,
        },
      };
    });

    const counters = spec.series.map((s, si) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      amount: spec.meta.seedKrw ? fmtKrw((spec.meta.seedKrw * cur[si]) / 100) : null,
      pct: fmtPct(cur[si] - 100, 1),
    }));

    const gapLabel =
      S >= 2 ? `격차  ${(Math.max(...cur) - Math.min(...cur)).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}%p` : undefined;

    const dateIdx = Math.min(k, N - 1);
    const [yy, mm] = time[dateIdx].split("-");
    const isEnding = frame >= nHook + nRace;

    const state: SceneState = {
      phase: isEnding ? "ending" : "race",
      background: BG,
      header: { title: spec.meta.title, subtitle, dateLabel: `${yy}년 ${Number(mm)}월` },
      chart: {
        yTicks: ticksBetween(b, t).map((v) => ({ y: yNorm(v), label: fmtPct(v - 100, 0) })),
        xTicks: yearTicks.map(({ i, label }) => ({ x: xNorm(i), label })),
        series,
      },
      counters,
      gapLabel,
      footnote,
    };

    if (isEnding) {
      const fin = vals.map((vs) => vs[N - 1]);
      const lines = spec.series.map((s, si) => {
        const amt = spec.meta.seedKrw ? `  ·  ${fmtKrw((spec.meta.seedKrw * fin[si]) / 100)}` : "";
        return `${s.name}  ${fmtPct(fin[si] - 100, 0)}${amt}`;
      });
      const gap = Math.max(...fin) - Math.min(...fin);
      state.ending = {
        title: spec.meta.contextLine,
        lines,
        gapLine: S >= 2 ? `격차 ${gap.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}%p` : "",
      };
    }
    return state;
  };

  return { totalFrames, fps, width: 1080, height: 1920, stateAt };
}
