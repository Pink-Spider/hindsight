// Remotion Studio 미리보기용 최소 기본 Spec. 실제 렌더는 워커가 inputProps로 spec을 주입한다.
import type { SceneSpec } from "@hindsight/scene-spec";

export const sampleSpec: SceneSpec = {
  specVersion: 1,
  template: "line-race",
  targetFps: 60,
  maxPoints: 600,
  timeline: { hookSec: 1.5, raceSec: 8, endSec: 3, warp: 0.6 },
  meta: {
    title: "샘플 타이틀",
    contextLine: "샘플 맥락 한 줄",
    returnType: "price",
    seedKrw: 10_000_000,
    dataSource: "sample",
  },
  axis: { time: ["2020-01-02", "2020-06-30", "2020-12-30", "2021-06-30", "2021-12-30"] },
  series: [
    { id: "AAA", name: "샘플 A", color: "#76B900", values: [100, 130, 95, 180, 240] },
    { id: "BBB", name: "샘플 B", color: "#5B8DEF", values: [100, 92, 104, 118, 131] },
  ],
};
