// 디버그용: 특정 프레임을 PNG로 렌더. 사용: tsx src/still.ts <spec.json> <frame> <out.png>
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { validateSceneSpec } from "@hindsight/scene-spec";

const REPO_ROOT = path.resolve(__dirname, "../../..");

async function main() {
  const [specArg, frameArg, outArg] = process.argv.slice(2);
  const spec = validateSceneSpec(JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, specArg), "utf8")));
  const serveUrl = await bundle({ entryPoint: path.join(REPO_ROOT, "packages/renderer-remotion/src/index.ts") });
  const inputProps = { spec };
  const composition = await selectComposition({ serveUrl, id: spec.template, inputProps });
  await renderStill({ composition, serveUrl, frame: Number(frameArg), output: path.resolve(outArg), inputProps });
  console.log(`완료: ${outArg}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
