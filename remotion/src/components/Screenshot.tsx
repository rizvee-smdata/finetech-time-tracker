import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C, sora, inter } from "../theme";

type Highlight = { x: number; y: number; w: number; h: number; label?: string };

export const Screenshot: React.FC<{
  src: string;
  step: string;
  title: string;
  subtitle?: string;
  /** Crop+zoom focus area expressed as 0-1 of the image (after centering). 1 = full image */
  focus?: { cx: number; cy: number; zoom: number };
  highlights?: Highlight[];
}> = ({ src, step, title, subtitle, focus, highlights = [] }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // Subtle Ken-Burns zoom across the whole scene
  const baseZoom = interpolate(frame, [0, durationInFrames], [1.0, 1.06]);
  const zoom = (focus?.zoom ?? 1) * baseZoom;
  const tx = focus ? interpolate(focus.cx, [0, 1], [width / 2, -width / 2]) : 0;
  const ty = focus ? interpolate(focus.cy, [0, 1], [height / 2, -height / 2]) : 0;

  const captionIn = spring({ frame, fps, config: { damping: 18, stiffness: 140 } });
  const captionY = interpolate(captionIn, [0, 1], [40, 0]);

  // Image fades in quickly
  const imgOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: `linear-gradient(135deg, ${C.bg}, ${C.bg2})` }}>
      {/* Screenshot frame */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          opacity: imgOpacity,
        }}
      >
        <div
          style={{
            position: "relative",
            width: 1500,
            height: 875,
            borderRadius: 18,
            overflow: "hidden",
            boxShadow: "0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)",
            background: "#fff",
            transform: `translate(${tx * (zoom - 1) * 0.5}px, ${ty * (zoom - 1) * 0.5}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
        >
          {/* macOS-style title bar */}
          <div
            style={{
              height: 32,
              background: "#EEF2FA",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 14px",
              borderBottom: "1px solid #DCE3F0",
            }}
          >
            <span style={{ width: 12, height: 12, borderRadius: 999, background: "#FF5F57" }} />
            <span style={{ width: 12, height: 12, borderRadius: 999, background: "#FEBC2E" }} />
            <span style={{ width: 12, height: 12, borderRadius: 999, background: "#28C840" }} />
            <span style={{ marginLeft: 16, fontFamily: inter, fontSize: 13, color: "#5C6B86" }}>
              lavishott.cloud
            </span>
          </div>
          <Img
            src={staticFile(src)}
            style={{ width: "100%", height: "calc(100% - 32px)", objectFit: "fill", background: "#fff" }}
          />
          {/* Highlights */}
          {highlights.map((h, i) => {
            const delay = 10 + i * 6;
            const pulse = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 120 } });
            const ring = 0.5 + 0.5 * Math.sin((frame - delay) * 0.25);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${h.x * 100}%`,
                  top: `${h.y * 100}%`,
                  width: `${h.w * 100}%`,
                  height: `${h.h * 100}%`,
                  border: `3px solid ${C.accent}`,
                  borderRadius: 12,
                  boxShadow: `0 0 ${20 + ring * 20}px ${C.accent}`,
                  opacity: pulse,
                  transform: `scale(${interpolate(pulse, [0, 1], [1.15, 1])})`,
                }}
              >
                {h.label && (
                  <div
                    style={{
                      position: "absolute",
                      top: -36,
                      left: 0,
                      background: C.accent,
                      color: "#06281E",
                      fontFamily: sora,
                      fontWeight: 700,
                      fontSize: 16,
                      padding: "6px 12px",
                      borderRadius: 8,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h.label}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* Caption */}
      <div
        style={{
          position: "absolute",
          left: 80,
          bottom: 70,
          transform: `translateY(${captionY}px)`,
          opacity: captionIn,
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "6px 14px",
            background: C.primary,
            color: "#fff",
            fontFamily: sora,
            fontWeight: 700,
            fontSize: 18,
            borderRadius: 999,
            letterSpacing: 1,
          }}
        >
          {step}
        </div>
        <div style={{ fontFamily: sora, fontWeight: 800, fontSize: 52, color: C.text, marginTop: 14, lineHeight: 1.1 }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontFamily: inter, fontSize: 22, color: C.sub, marginTop: 8, maxWidth: 900 }}>{subtitle}</div>
        )}
      </div>
    </AbsoluteFill>
  );
};
