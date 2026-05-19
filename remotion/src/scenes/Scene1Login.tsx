import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { Phone } from "../components/Phone";
import { Background } from "../components/Background";
import { sora, inter, C } from "../theme";

export const Scene1Login: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const phoneIn = spring({ frame: f, fps, config: { damping: 18, stiffness: 120 } });
  const titleOp = interpolate(f, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(f, [0, 20], [20, 0], { extrapolateRight: "clamp" });

  const email = "fazlur@smartdataltd.com";
  const typed = email.slice(0, Math.max(0, Math.floor((f - 25) * 0.9)));
  const pwLen = Math.max(0, Math.min(10, Math.floor((f - 70) * 0.4)));
  const btnPulse = f > 105 && f < 120 ? 1.05 : 1;

  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 90, padding: 80 }}>
        <div style={{ flex: 1, maxWidth: 720, opacity: titleOp, transform: `translateY(${titleY}px)` }}>
          <div style={{ fontFamily: inter, color: C.accent, letterSpacing: 6, fontSize: 22, fontWeight: 600 }}>MORNING · 8:45 AM</div>
          <div style={{ fontFamily: sora, color: C.text, fontSize: 96, fontWeight: 800, lineHeight: 1.05, marginTop: 18 }}>
            Start your day.
          </div>
          <div style={{ fontFamily: sora, color: C.primary, fontSize: 96, fontWeight: 800, lineHeight: 1.05 }}>
            Sign in.
          </div>
          <div style={{ fontFamily: inter, color: C.sub, fontSize: 26, marginTop: 24, maxWidth: 560 }}>
            Open the app and log in with your work email and password.
          </div>
        </div>

        <div style={{ transform: `translateY(${(1 - phoneIn) * 200}px) scale(${0.9 + phoneIn * 0.1})`, opacity: phoneIn }}>
          <Phone>
            <div style={{ padding: 40, fontFamily: inter }}>
              <div style={{ marginTop: 30, fontFamily: sora, fontSize: 36, fontWeight: 700 }}>Welcome back</div>
              <div style={{ color: C.sub, fontSize: 18, marginTop: 6 }}>Sign in to continue</div>

              <Field label="Email">{typed}<Caret show={f > 25 && f < 70} /></Field>
              <Field label="Password">{"•".repeat(pwLen)}<Caret show={f > 70 && f < 105} /></Field>

              <div style={{
                marginTop: 32, height: 64, borderRadius: 16,
                background: `linear-gradient(135deg, ${C.primary}, #7aa6ff)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 20, color: "#0B1020",
                transform: `scale(${btnPulse})`, boxShadow: `0 14px 30px ${C.primary}55`,
              }}>
                Sign in
              </div>
            </div>
          </Phone>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Field: React.FC<{ label: string; children?: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginTop: 26 }}>
    <div style={{ color: C.sub, fontSize: 14, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
    <div style={{
      marginTop: 8, height: 56, borderRadius: 14, background: C.card,
      border: `1px solid ${C.line}`, display: "flex", alignItems: "center",
      padding: "0 18px", fontSize: 20, color: C.text,
    }}>{children}</div>
  </div>
);

const Caret: React.FC<{ show: boolean }> = ({ show }) => {
  const f = useCurrentFrame();
  if (!show) return null;
  return <span style={{ opacity: Math.floor(f / 8) % 2 === 0 ? 1 : 0, marginLeft: 2 }}>|</span>;
};
