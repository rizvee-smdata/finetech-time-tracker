import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C } from "../theme";

export const Background: React.FC = () => {
  const f = useCurrentFrame();
  const drift = interpolate(f, [0, 900], [0, 60]);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 800px at 20% 10%, #1a2456 0%, ${C.bg} 60%)` }}>
      <AbsoluteFill style={{ background: `radial-gradient(900px 700px at ${80 - drift / 4}% 90%, #1f2a66 0%, transparent 60%)` }} />
      <AbsoluteFill style={{ opacity: 0.06, backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "80px 80px", transform: `translateY(${drift}px)` }} />
    </AbsoluteFill>
  );
};
