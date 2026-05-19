import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { C, sora, inter } from "../theme";

export const Title: React.FC<{ headline: string; tagline: string }> = ({ headline, tagline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t1 = spring({ frame, fps, config: { damping: 18 } });
  const t2 = spring({ frame: frame - 12, fps, config: { damping: 18 } });
  const drift = Math.sin(frame * 0.03) * 8;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at 30% 30%, #1E2A66 0%, ${C.bg} 60%)`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontFamily: sora,
          fontWeight: 800,
          fontSize: 110,
          color: C.text,
          letterSpacing: -1,
          textAlign: "center",
          opacity: t1,
          transform: `translateY(${interpolate(t1, [0, 1], [40, drift])}px)`,
        }}
      >
        {headline}
      </div>
      <div
        style={{
          fontFamily: inter,
          fontSize: 32,
          color: C.sub,
          marginTop: 18,
          opacity: t2,
          transform: `translateY(${interpolate(t2, [0, 1], [40, 0])}px)`,
        }}
      >
        {tagline}
      </div>
    </AbsoluteFill>
  );
};
