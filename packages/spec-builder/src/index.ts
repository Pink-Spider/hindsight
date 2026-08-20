// 정규화(union 거래일 축 + forward-fill) → 리베이스 100 → 균등 다운샘플 → Scene Spec.
// 순수 함수 — DB 접근 없음. I/O는 호출자(apps/server, P5 apps/api) 책임.
import { validateSceneSpec, type SceneSpec } from "@hindsight/scene-spec";

export type RawSeries = {
  id: string;
  name: string;
  color?: string;
  dates: string[]; // YYYY-MM-DD, 오름차순
  values: number[]; // adj_close
};

export type BuildInput = {
  series: RawSeries[];
  template?: "line-race";
  targetFps?: number;
  maxPoints?: number;
  timeline?: Partial<{ hookSec: number; raceSec: number; endSec: number; warp: number }>;
  bgm?: { track: string; gainDb?: number };
  meta: {
    title: string;
    contextLine: string;
    returnType?: "price" | "total";
    seedKrw?: number;
    dataSource: string;
  };
};

// 종목별 고정 팔레트 — 입력에 color가 없을 때 순서대로 배정
const PALETTE = ["#76B900", "#5B8DEF", "#F2A93B", "#E85D75", "#41C9A2", "#B07CF7", "#F06423"];

const DEFAULT_TIMELINE = { hookSec: 1.5, raceSec: 35.5, endSec: 3.0, warp: 0.6 };

export function buildSceneSpec(input: BuildInput): SceneSpec {
  const maxPoints = input.maxPoints ?? 600;
  if (input.series.length === 0) throw new Error("시리즈가 비어 있음");
  for (const s of input.series) {
    if (s.dates.length !== s.values.length) throw new Error(`${s.id}: dates/values 길이 불일치`);
    if (s.dates.length < 2) throw new Error(`${s.id}: 데이터가 2행 미만`);
  }

  // 1) union 거래일 축
  const union = [...new Set(input.series.flatMap((s) => s.dates))].sort();

  // 2) forward-fill + 시작 정렬: 모든 시리즈에 값이 생기는 첫 날부터 (늦은 상장 종목 기준)
  const filled = input.series.map((s) => {
    const byDate = new Map(s.dates.map((d, i) => [d, s.values[i]]));
    const out = new Array<number | null>(union.length);
    let prev: number | null = null;
    for (let i = 0; i < union.length; i++) {
      const v = byDate.get(union[i]);
      if (v !== undefined) prev = v;
      out[i] = prev;
    }
    return out;
  });
  const firstFull = union.findIndex((_, i) => filled.every((f) => f[i] !== null));
  if (firstFull < 0) throw new Error("공통 구간이 없음 — 기간/종목 조합 확인");
  let time = union.slice(firstFull);
  let matrix = filled.map((f) => f.slice(firstFull) as number[]);
  if (time.length < 2) throw new Error("공통 구간이 2거래일 미만");

  // 3) 리베이스 100
  matrix = matrix.map((vs) => {
    const base = vs[0];
    return vs.map((v) => (v / base) * 100);
  });

  // 4) 균등 스트라이드 다운샘플 (ADR-002 결정 2) — 전 시리즈 같은 인덱스 → 공유 축 보장
  if (time.length > maxPoints) {
    const n = time.length;
    const keep = [...new Set(Array.from({ length: maxPoints }, (_, i) => Math.round((i * (n - 1)) / (maxPoints - 1))))];
    time = keep.map((i) => time[i]);
    matrix = matrix.map((vs) => keep.map((i) => vs[i]));
  }

  const spec = {
    specVersion: 1 as const,
    template: input.template ?? ("line-race" as const),
    targetFps: input.targetFps ?? 60,
    maxPoints,
    timeline: { ...DEFAULT_TIMELINE, ...input.timeline },
    ...(input.bgm ? { bgm: input.bgm } : {}),
    meta: {
      title: input.meta.title,
      contextLine: input.meta.contextLine,
      returnType: input.meta.returnType ?? ("price" as const),
      ...(input.meta.seedKrw ? { seedKrw: input.meta.seedKrw } : {}),
      dataSource: input.meta.dataSource,
    },
    axis: { time },
    series: input.series.map((s, i) => ({
      id: s.id,
      name: s.name,
      color: s.color ?? PALETTE[i % PALETTE.length],
      values: matrix[i].map((v) => Math.round(v * 10000) / 10000),
    })),
  };
  return validateSceneSpec(spec);
}
