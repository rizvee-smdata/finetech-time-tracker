import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { Phone } from "../components/Phone";
import { Background } from "../components/Background";
import { sora, inter, C } from "../theme";

export const Scene4Reminders: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame: f, fps, config: { damping: 20 } });

  const items = [
    { t: "Call Acme Corp — proposal", w: "Today · 2:00 PM", c: C.warn },
    { t: "Follow up: Beta Industries", w: "Today · 4:30 PM", c: C.primary },
    { t: "Site visit — Delta Ltd", w: "Tomorrow · 10:00 AM", c: C.accent },
  ];

  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 90, padding: 80 }}>
        <div style={{ transform: `translateY(${(1 - inP) * 80}px)`, opacity: inP }}>
          <Phone>
            <div style={{ padding: 32, fontFamily: inter }}>
              <div style={{ marginTop: 8, fontFamily: sora, fontSize: 28, fontWeight: 700 }}>Reminders</div>
              <div style={{ color: C.sub, fontSize: 16, marginTop: 4 }}>Your next actions, in order.</div>
              <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
                {items.map((it, i) => {
                  const delay = 20 + i * 18;
                  const op = interpolate(f, [delay, delay + 18], [0, 1], { extrapolateRight: "clamp" });
                  const x = interpolate(f, [delay, delay + 18], [40, 0], { extrapolateRight: "clamp" });
                  return (
                    <div key={i} style={{
                      opacity: op, transform: `translateX(${x}px)`,
                      background: C.card, border: `1px solid ${C.line}`,
                      borderRadius: 16, padding: 16, display: "flex", gap: 14, alignItems: "center",
                    }}>
                      <div style={{ width: 6, height: 44, borderRadius: 4, background: it.c }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 16 }}>{it.t}</div>
                        <div style={{ color: C.sub, fontSize: 13, marginTop: 2 }}>{it.w}</div>
                      </div>
                      <div style={{ fontSize: 18, color: C.sub }}>›</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Phone>
        </div>

        <div style={{ flex: 1, maxWidth: 720 }}>
          <div style={{ fontFamily: inter, color: C.primary, letterSpacing: 6, fontSize: 22, fontWeight: 600 }}>STEP 03</div>
          <div style={{ fontFamily: sora, color: C.text, fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
            Never miss a
          </div>
          <div style={{ fontFamily: sora, color: C.warn, fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
            follow-up.
          </div>
          <div style={{ fontFamily: inter, color: C.sub, fontSize: 26, marginTop: 24, maxWidth: 580 }}>
            Every "next action" you log becomes a reminder. Check the list throughout the day.
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
