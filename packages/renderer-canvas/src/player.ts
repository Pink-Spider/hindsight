// Renderer B — 실시간 재생 플레이어 (웹 미리보기, P5 앱 재사용 예정)
import { validateSceneSpec, type SceneSpec } from "@hindsight/scene-spec";
import { createTimeline } from "@hindsight/templates";
import { CANVAS_W, drawScene } from "./draw";

export type Player = {
  totalFrames: number;
  fps: number;
  play: () => void;
  pause: () => void;
  restart: () => void;
  seek: (frame: number) => void;
  isPlaying: () => boolean;
  currentFrame: () => number;
  dispose: () => void;
};

export function createPlayer(canvas: HTMLCanvasElement, spec: SceneSpec): Player {
  const timeline = createTimeline(validateSceneSpec(spec));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D 컨텍스트를 얻을 수 없음");
  const scale = canvas.width / CANVAS_W;

  let raf = 0;
  let startTs = 0;
  let frame = 0;
  let playing = false;

  const renderFrame = (f: number) => {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawScene(ctx, timeline.stateAt(Math.max(0, Math.min(f, timeline.totalFrames - 1))));
  };

  const tick = (ts: number) => {
    if (!playing) return;
    if (!startTs) startTs = ts - (frame / timeline.fps) * 1000;
    frame = Math.floor(((ts - startTs) / 1000) * timeline.fps);
    if (frame >= timeline.totalFrames) {
      frame = timeline.totalFrames - 1;
      playing = false;
    }
    renderFrame(frame);
    if (playing) raf = requestAnimationFrame(tick);
  };

  renderFrame(0);

  return {
    totalFrames: timeline.totalFrames,
    fps: timeline.fps,
    play() {
      if (playing) return;
      if (frame >= timeline.totalFrames - 1) frame = 0;
      playing = true;
      startTs = 0;
      raf = requestAnimationFrame(tick);
    },
    pause() {
      playing = false;
      cancelAnimationFrame(raf);
    },
    restart() {
      frame = 0;
      startTs = 0;
      renderFrame(0);
      if (!playing) {
        playing = true;
        raf = requestAnimationFrame(tick);
      }
    },
    seek(f: number) {
      frame = f;
      startTs = 0;
      renderFrame(f);
    },
    isPlaying: () => playing,
    currentFrame: () => frame,
    dispose() {
      playing = false;
      cancelAnimationFrame(raf);
    },
  };
}
