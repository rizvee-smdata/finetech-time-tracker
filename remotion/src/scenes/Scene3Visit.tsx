import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { Phone } from "../components/Phone";
import { Background } from "../components/Background";
import { sora, inter, C } from "../theme";

export const Scene3Visit: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame: f, fps, config: { damping: 20 } });

  const customer = "Acme Corp";
  const customerTyped = customer.slice(0, Math.max(0, Math.floor((f - 20) * 0.4)));

  const micActive = f > 80 && f < 180;
  const summary = "Discussed Q3 pricing for the new analytics module. Client interested.";
  const summaryShown = micActive ? summary.slice(0, Math.max(0, Math.floor((f - 90) * 1.4))) : (f >= 180 ? summary : "");

  const pulse = micActive ? 1 + Math.sin(f * 0.6) * 0.08 : 1;

  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 90, padding: 80 }}>
        <div style={{ flex: 1, maxWidth: 720 }}>
          <div style={{ fontFamily: inter, color: C.primary, letterSpacing: 6, fontSize: 22, fontWeight: 600 }}>STEP 02</div>
          <div style={{ fontFamily: sora, color: C.text, fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
            Log every visit.
          </div>
          <div style={{ fontFamily: inter, color: C.sub, fontSize: 26, marginTop: 24, maxWidth: 580 }}>
            Pick the customer, then tap the mic to dictate your discussion summary, next action and remarks — no typing needed.
          </div>
          <div style={{ marginTop: 36, display: "flex", gap: 14, flexWrap: "wrap" }}>
            {["Customer", "Discussion", "Next action", "Remarks"].map((t) => (
              <div key={t} style={{ padding: "10px 18px", borderRadius: 999, background: C.card, border: `1px solid ${C.line}`, color: C.sub, fontFamily: inter, fontSize: 18 }}>{t}</div>
            ))}
          </div>
        </div>

        <div style={{ transform: `translateX(${(1 - inP) * 150}px)`, opacity: inP }}>
          <Phone>
            <div style={{ padding: 32, fontFamily: inter }}>
              <div style={{ marginTop: 8, fontFamily: sora, fontSize: 26, fontWeight: 700 }}>New visit</div>
              <Field label="Customer">{customerTyped}</Field>

              <div style={{ marginTop: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: C.sub, fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>Discussion summary</div>
                  <div style={{
                    width: 38, height: 38, borderRadius: 999,
                    background: micActive ? C.warn : C.line,
                    display: "grid", placeItems: "center", fontSize: 18,
                    transform: `scale(${pulse})`,
                    boxShadow: micActive ? `0 0 0 ${6 + Math.sin(f * 0.6) * 4}px ${C.warn}33` : "none",
                  }}>🎙</div>
                </div>
                <div style={{
                  marginTop: 8, minHeight: 130, borderRadius: 14, background: C.card,
                  border: `1px solid ${C.line}`, padding: 14, fontSize: 17, color: C.text, lineHeight: 1.45,
                }}>
                  {summaryShown}
                  {micActive && <span style={{ opacity: Math.floor(f / 6) % 2 === 0 ? 1 : 0 }}>▍</span>}
                </div>
              </div>

              <Field label="Next action">{f > 200 ? "Send proposal by Friday" : ""}</Field>

              <div style={{
                marginTop: 26, height: 56, borderRadius: 14,
                background: f > 240 ? C.accent : `linear-gradient(135deg, ${C.primary}, #7aa6ff)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 18, color: "#0B1020",
              }}>
                {f > 240 ? "✓ Visit saved" : "Save visit"}
              </div>
            </div>
          </Phone>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Field: React.FC<{ label: string; children?: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginTop: 18 }}>
    <div style={{ color: C.sub, fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
    <div style={{ marginTop: 6, height: 48, borderRadius: 12, background: C.card, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 17 }}>{children}</div>
  </div>
);
