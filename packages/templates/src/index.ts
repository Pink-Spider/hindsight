import type { SceneSpec } from "@hindsight/scene-spec";
import { createLineRaceTimeline } from "./line-race";
import type { Timeline } from "./types";

export type { ChartPoint, SceneState, Timeline } from "./types";
export { fmtKrw } from "./line-race";

export function createTimeline(spec: SceneSpec): Timeline {
  switch (spec.template) {
    case "line-race":
      return createLineRaceTimeline(spec);
  }
}
