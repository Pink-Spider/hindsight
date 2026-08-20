// Renderer A — Remotion 셸. 그리기는 renderer-canvas의 drawScene 하나를 공유한다 (계약 ③ 보완).
// 미리보기(웹)와 mp4가 같은 픽셀을 그리는 것이 이 구조의 목적. 여기에 그리기 코드를 추가하지 말 것.
import React, { useEffect, useMemo, useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { validateSceneSpec, type SceneSpec } from "@hindsight/scene-spec";
import { createTimeline } from "@hindsight/templates";
import { CANVAS_H, CANVAS_W, drawScene } from "@hindsight/renderer-canvas";

export const LineRace: React.FC<{ spec: SceneSpec }> = ({ spec }) => {
  const timeline = useMemo(() => createTimeline(validateSceneSpec(spec)), [spec]);
  const frame = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    drawScene(ctx, timeline.stateAt(frame));
  }, [frame, timeline]);

  return (
    <AbsoluteFill>
      <canvas ref={ref} width={CANVAS_W} height={CANVAS_H} style={{ width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
};
