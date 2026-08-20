// 계약 ③ — 템플릿 출력. 정규화 좌표(0~1)·텍스트·색만 담는 순수 데이터.
// 페인터(Remotion/Canvas)는 이것을 픽셀로 변환해 그리기만 한다.

export type ChartPoint = { x: number; y: number }; // 0~1. y는 차트 하단이 0, 상단이 1

export type SceneState = {
  phase: "hook" | "race" | "ending";
  background: string;
  hook?: { titleLines: string[]; subtitle: string };
  header?: { title: string; subtitle: string; dateLabel: string };
  chart?: {
    yTicks: { y: number; label: string }[];
    xTicks: { x: number; label: string }[];
    series: {
      id: string;
      color: string;
      points: ChartPoint[];
      head: ChartPoint;
      badge: { text: string; dir: 1 | -1 }; // dir: 배지 상(1)/하(-1) 오프셋 — 초반 겹침 방지
    }[];
  };
  counters?: {
    id: string;
    name: string;
    color: string;
    amount: string | null; // seedKrw 없으면 null
    pct: string;
  }[];
  gapLabel?: string;
  ending?: { title: string; lines: string[]; gapLine: string };
  footnote: string;
};

export type Timeline = {
  totalFrames: number;
  fps: number;
  width: number;
  height: number;
  stateAt: (frame: number) => SceneState;
};
