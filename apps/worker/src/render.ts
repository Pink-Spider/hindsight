// P1 렌더 CLI — Scene Spec JSON → mp4. (큐 소비는 queue.ts)
// 사용: pnpm render <spec.json> [out.mp4]  (레포 루트에서: pnpm render specs/nvda_spy.json)
import fs from "node:fs";
import path from "node:path";
import { validateSceneSpec } from "@hindsight/scene-spec";
import { REPO_ROOT, renderSpec } from "./render-core";

function resolveInput(p: string): string {
  if (fs.existsSync(p)) return path.resolve(p);
  const fromRoot = path.join(REPO_ROOT, p);
  if (fs.existsSync(fromRoot)) return fromRoot;
  throw new Error(`spec 파일을 찾을 수 없음: ${p}`);
}

async function main() {
  const specArg = process.argv[2];
  if (!specArg) {
    console.error("사용법: pnpm render <spec.json> [out.mp4]");
    process.exit(1);
  }
  const specPath = resolveInput(specArg);
  const spec = validateSceneSpec(JSON.parse(fs.readFileSync(specPath, "utf8")));
  const outPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(REPO_ROOT, "out", `${path.basename(specPath, ".json")}_remotion.mp4`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  console.log(`렌더: ${specPath} → ${outPath}`);
  let lastPct = -1;
  await renderSpec(spec, outPath, (rendered, total) => {
    const pct = Math.floor((rendered / total) * 10) * 10;
    if (pct > lastPct) {
      lastPct = pct;
      console.log(`  ${rendered}/${total} (${pct}%)`);
    }
  });
  console.log(`완료: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
