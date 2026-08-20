// 렌더 코어 — CLI(render.ts)와 큐 소비(queue.ts)가 공유. 번들은 프로세스당 1회.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { SceneSpec } from "@hindsight/scene-spec";

const execFileAsync = promisify(execFile);

export const REPO_ROOT = path.resolve(__dirname, "../../..");
export const BGM_DIR = path.join(REPO_ROOT, "assets", "bgm");

let serveUrlPromise: Promise<string> | null = null;

function getServeUrl(): Promise<string> {
  serveUrlPromise ??= bundle({
    entryPoint: path.join(REPO_ROOT, "packages/renderer-remotion/src/index.ts"),
  });
  return serveUrlPromise;
}

export async function renderSpec(
  spec: SceneSpec,
  outPath: string,
  onProgress?: (rendered: number, total: number) => void
): Promise<void> {
  const serveUrl = await getServeUrl();
  const inputProps = { spec };
  const composition = await selectComposition({ serveUrl, id: spec.template, inputProps });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    crf: 18,
    outputLocation: outPath,
    inputProps,
    onProgress: ({ renderedFrames }) => onProgress?.(renderedFrames, composition.durationInFrames),
  });
  if (spec.bgm) {
    await muxBgm(outPath, spec.bgm, composition.durationInFrames / composition.fps);
  }
}

// BGM 먹싱 — 트랙을 영상 길이로 루프하고 페이드인 0.8s / 페이드아웃 2.5s.
// Remotion <Audio> 대신 ffmpeg 후처리를 쓰는 이유: 번들에 오디오를 넣을 필요가 없고,
// CLI·큐 어느 경로든 동일하게 동작하며, 트랙 길이와 무관하다.
async function muxBgm(
  videoPath: string,
  bgm: NonNullable<SceneSpec["bgm"]>,
  durationSec: number
): Promise<void> {
  const track = path.join(BGM_DIR, path.basename(bgm.track)); // basename — 경로 탈출 방지
  if (!fs.existsSync(track)) throw new Error(`BGM 트랙 없음: ${track}`);
  const gain = bgm.gainDb ?? -6;
  const fadeOutStart = Math.max(0, durationSec - 2.5);
  const tmp = `${videoPath}.bgm.mp4`;
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", videoPath,
    "-stream_loop", "-1",
    "-i", track,
    "-map", "0:v",
    "-map", "1:a",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-af", `volume=${gain}dB,afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutStart}:d=2.5`,
    "-shortest",
    tmp,
  ]);
  fs.renameSync(tmp, videoPath);
}
