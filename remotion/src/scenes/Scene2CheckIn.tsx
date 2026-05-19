import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { Phone } from "../components/Phone";
import { Background } from "../components/Background";
import { sora, inter, C } from "../theme";

export const Scene2CheckIn: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame: f, fps, config: { damping: 20 } });
  const tap = f > 60 && f < 75;
  const checked = f > 75;
  const ringScale = checked ? interpolate(f, [75, 95], [1, 1.15], { extrapolateRight: "clamp" }) : 1;

  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 90, padding: 80 }}>
        <div style={{ transform: `translateX(${(1 - inP) * -150}px)`, opacity: inP }}>
          <Phone>
            <div style={{ padding: 36, fontFamily: inter }}>
              <div style={{ marginTop: 16, fontFamily: sora, fontSize: 28, fontWeight: 700 }}>Time clock</div>
              <div style={{ color: C.sub, fontSize: 16 }}>Mark your office start and end time.</div>

              <div style={{
                marginTop: 36, borderRadius: 28, padding: 36, textAlign: "center",
                background: `linear-gradient(180deg, #1c2554, #141b3b)`, border: `1px solid ${C.line}`,
              }}>
                <div style={{
                  margin: "6px auto 18px", width: 96, height: 96, borderRadius: 24,
                  background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
                  display: "grid", placeItems: "center", fontSize: 44,
                  transform: `scale(${ringScale})`,
                  boxShadow: `0 18px 40px ${C.primary}55`,
                }}>⏱</div>
                {!checked ? (
                  <>
                    <div style={{ color: C.sub, fontSize: 16 }}>You are not checked in</div>
                    <div style={{
                      marginTop: 22, height: 60, borderRadius: 14,
                      background: tap ? "#3d6ddf" : C.primary, color: "#0B1020",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, fontSize: 18,
                      transform: tap ? "scale(0.97)" : "scale(1)",
                    }}>→  Check in now</div>
                  </>
                ) : (
                  <>
                    <div style={{ color: C.sub, fontSize: 14 }}>Checked in at</div>
                    <div style={{ fontFamily: sora, fontSize: 26, fontWeight: 700, marginTop: 4 }}>8:47 AM</div>
                    <div style={{ color: C.accent, fontSize: 14, marginTop: 4 }}>● Active</div>
                  </>
                )}
              </div>

              {checked && (
                <Cursor x={260} y={-220} />
              )}
            </div>
          </Phone>
        </div>

        <div style={{ flex: 1, maxWidth: 720 }}>
          <Step n="01" />
          <div style={{ fontFamily: sora, color: C.text, fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
            Check in
          </div>
          <div style={{ fontFamily: sora, color: C.accent, fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
            for the day.
          </div>
          <div style={{ fontFamily: inter, color: C.sub, fontSize: 26, marginTop: 24, maxWidth: 560 }}>
            One tap to start your work day. The timer runs in the background.
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Step: React.FC<{ n: string }> = ({ n }) => (
  <div style={{ fontFamily: inter, color: C.primary, letterSpacing: 6, fontSize: 22, fontWeight: 600 }}>STEP {n}</div>
);

const Cursor: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <div style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(${x}px, ${y}px)`, fontSize: 36 }}>👆</div>
);
