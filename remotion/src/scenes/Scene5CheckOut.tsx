import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { Phone } from "../components/Phone";
import { Background } from "../components/Background";
import { sora, inter, C } from "../theme";

export const Scene5CheckOut: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame: f, fps, config: { damping: 20 } });
  const stats = [
    { k: "Visits", v: "4" },
    { k: "Reminders done", v: "3" },
    { k: "Hours", v: "8h 32m" },
  ];

  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 90, padding: 80 }}>
        <div style={{ flex: 1, maxWidth: 720 }}>
          <div style={{ fontFamily: inter, color: C.accent, letterSpacing: 6, fontSize: 22, fontWeight: 600 }}>EVENING · 5:30 PM</div>
          <div style={{ fontFamily: sora, color: C.text, fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
            Wrap it up.
          </div>
          <div style={{ fontFamily: sora, color: C.accent, fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
            Check out.
          </div>
          <div style={{ fontFamily: inter, color: C.sub, fontSize: 26, marginTop: 24, maxWidth: 580 }}>
            One last tap. Your day is logged — visits, time, and follow-ups, all in one place.
          </div>
        </div>

        <div style={{ transform: `scale(${0.92 + inP * 0.08})`, opacity: inP }}>
          <Phone>
            <div style={{ padding: 32, fontFamily: inter }}>
              <div style={{ marginTop: 8, fontFamily: sora, fontSize: 26, fontWeight: 700 }}>Today's summary</div>
              <div style={{ color: C.sub, fontSize: 15, marginTop: 4 }}>May 19, 2026</div>

              <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
                {stats.map((s, i) => {
                  const delay = 20 + i * 14;
                  const op = interpolate(f, [delay, delay + 16], [0, 1], { extrapolateRight: "clamp" });
                  return (
                    <div key={s.k} style={{
                      opacity: op,
                      borderRadius: 16, padding: 18, background: C.card, border: `1px solid ${C.line}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <div style={{ color: C.sub, fontSize: 16 }}>{s.k}</div>
                      <div style={{ fontFamily: sora, fontSize: 28, fontWeight: 700, color: C.text }}>{s.v}</div>
                    </div>
                  );
                })}
              </div>

              <div style={{
                marginTop: 26, height: 60, borderRadius: 14,
                background: `linear-gradient(135deg, ${C.accent}, #5ee7c0)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 18, color: "#06231b",
              }}>
                ← Check out
              </div>

              <div style={{ marginTop: 18, textAlign: "center", color: C.sub, fontSize: 14 }}>Great work today 👋</div>
            </div>
          </Phone>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
