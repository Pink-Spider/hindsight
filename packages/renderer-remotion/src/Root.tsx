import React from "react";
import { Composition } from "remotion";
import { validateSceneSpec } from "@hindsight/scene-spec";
import { createTimeline } from "@hindsight/templates";
import { LineRace } from "./LineRace";
import { sampleSpec } from "./sample-spec";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="line-race"
      component={LineRace}
      durationInFrames={60}
      fps={60}
      width={1080}
      height={1920}
      defaultProps={{ spec: sampleSpec }}
      calculateMetadata={({ props }) => {
        const spec = validateSceneSpec(props.spec);
        const tl = createTimeline(spec);
        return {
          durationInFrames: tl.totalFrames,
          fps: tl.fps,
          width: tl.width,
          height: tl.height,
          props: { spec },
        };
      }}
    />
  );
};
