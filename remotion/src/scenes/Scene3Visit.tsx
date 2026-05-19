import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { Phone } from "../components/Phone";
import { Background } from "../components/Background";
import { sora, inter, C } from "../theme";

export const Scene3Visit: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame: f, fps, config: { damping: 20 } });

  const customer = "Acme Corporation";
  const customerTyped = customer.slice(0, Math.max(0, Math.floor((f - 20) * 0.4)));

  // Voice-to-text demo
  const micActive = f > 80 && f < 230;
  const summary = "Discussed Q3 pricing for the new analytics module. Client is interested in a pilot.";
  const summaryShown = micActive
    ? summary.slice(0, Math.max(0, Math.floor((f - 95) * 1.1)))
    : f >= 230 ? summary : "";

  const pulse = micActive ? 1 + Math.sin(f * 0.6) * 0.1 : 1;
  const nextActionVisible = f > 250;
  const nextAction = "Send proposal by Friday";
  const nextActionShown = nextActionVisible ? nextAction.slice(0, Math.max(0, Math.floor((f - 250) * 0.7))) : "";

  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 90, padding: 80 }}>
        <div style={{ flex: 1, maxWidth: 720 }}>
          <div style={{ fontFamily: inter, color: C.primary, letterSpacing: 6, fontSize: 22, fontWeight: 600 }}>STEP 03</div>
          <div style={{ fontFamily: sora, color: C.text, fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
            Speak it.<br />Don't type it.
          </div>
          <div style={{ fontFamily: inter, color: C.sub, fontSize: 26, marginTop: 24, maxWidth: 580 }}>
            Tap the mic on Discussion, Next Action or Remarks and just talk. Your words appear live on the form.
          </div>

          {/* Spoken caption bubble */}
          {micActive && (
            <div style={{
              marginTop: 32, padding: "18px 22px", borderRadius: 18,
              background: C.card, border: `1px solid ${C.warn}66`,
              maxWidth: 560, fontFamily: inter, fontSize: 22, color: C.text,
              display: "flex", alignItems: "center", gap: 14,
              boxShadow: `0 0 0 ${4 + Math.sin(f * 0.6) * 3}px ${C.warn}22`,
            }}>
              <span style={{ fontSize: 24 }}>🎙</span>
              <span style={{ fontStyle: "italic", opacity: 0.95 }}>"{summaryShown}"</span>
            </div>
          )}

          <div style={{ marginTop: 28, display: "flex", gap: 14, flexWrap: "wrap" }}>
            {["Discussion", "Next action", "Remarks"].map((t) => (
              <div key={t} style={{ padding: "10px 18px", borderRadius: 999, background: C.card, border: `1px solid ${C.line}`, color: C.sub, fontFamily: inter, fontSize: 18 }}>🎙 {t}</div>
            ))}
          </div>
        </div>

        <div style={{ transform: `translateX(${(1 - inP) * 150}px)`, opacity: inP }}>
          <Phone>
            <div style={{ padding: 28, fontFamily: inter }}>
              <div style={{ marginTop: 4, fontFamily: sora, fontSize: 24, fontWeight: 700 }}>New visit</div>
              <Field label="Customer">{customerTyped}</Field>

              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: C.sub, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>Discussion summary</div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    color: micActive ? C.warn : C.sub, fontSize: 12, fontWeight: 600,
                  }}>
                    {micActive && <Waveform f={f} />}
                    {micActive ? "Listening…" : ""}
                  </div>
                </div>
                <div style={{ position: "relative", marginTop: 8 }}>
                  <div style={{
                    minHeight: 120, borderRadius: 14, background: C.card,
                    border: `1px solid ${micActive ? C.warn : C.line}`,
                    padding: 14, fontSize: 16, color: C.text, lineHeight: 1.45,
                  }}>
                    {summaryShown}
                    {micActive && <span style={{ opacity: Math.floor(f / 6) % 2 === 0 ? 1 : 0 }}>▍</span>}
                  </div>
                  <div style={{
                    position: "absolute", right: 12, bottom: 12,
                    width: 44, height: 44, borderRadius: 999,
                    background: micActive ? C.warn : C.line,
                    display: "grid", placeItems: "center", fontSize: 20,
                    transform: `scale(${pulse})`,
                    boxShadow: micActive ? `0 0 0 ${6 + Math.sin(f * 0.6) * 5}px ${C.warn}33` : "none",
                  }}>🎙</div>
                </div>
              </div>

              <Field label="Next action">{nextActionShown}</Field>

              <div style={{
                marginTop: 22, height: 54, borderRadius: 14,
                background: f > 285 ? C.accent : `linear-gradient(135deg, ${C.primary}, #7aa6ff)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 18, color: "#0B1020",
              }}>
                {f > 285 ? "✓ Visit saved" : "Save visit"}
              </div>
            </div>
          </Phone>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Waveform: React.FC<{ f: number }> = ({ f }) => {
  const bars = 16;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 18 }}>
      {Array.from({ length: bars }).map((_, i) => {
        const h = 4 + Math.abs(Math.sin(f * 0.4 + i * 0.7)) * 14;
        return <div key={i} style={{ width: 3, height: h, background: C.warn, borderRadius: 2 }} />;
      })}
    </div>
  );
};

const Field: React.FC<{ label: string; children?: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginTop: 16 }}>
    <div style={{ color: C.sub, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
    <div style={{ marginTop: 6, height: 46, borderRadius: 12, background: C.card, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 16 }}>{children}</div>
  </div>
);
