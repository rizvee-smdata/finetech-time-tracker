import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { Phone } from "../components/Phone";
import { Background } from "../components/Background";
import { sora, inter, C } from "../theme";

const TABS = ["Customers", "Partners", "Consultants"];

export const Scene2bContacts: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame: f, fps, config: { damping: 20 } });

  // tab switching: Customers (0-60), Partners (60-120), Consultants (120-180)
  const activeTab = f < 60 ? 0 : f < 120 ? 1 : 2;

  // form appears after tab settles
  const formStart = 130;
  const name = "Acme Corporation";
  const contact = "Sarah Lee · +1 415 555 0148";
  const nameTyped = name.slice(0, Math.max(0, Math.floor((f - formStart) * 0.5)));
  const contactTyped = f > formStart + 50 ? contact.slice(0, Math.max(0, Math.floor((f - formStart - 50) * 0.6))) : "";

  const saved = f > 210;

  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 90, padding: 80 }}>
        <div style={{ flex: 1, maxWidth: 720 }}>
          <div style={{ fontFamily: inter, color: C.accent, letterSpacing: 6, fontSize: 22, fontWeight: 600 }}>STEP 02</div>
          <div style={{ fontFamily: sora, color: C.text, fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
            Build your network.
          </div>
          <div style={{ fontFamily: inter, color: C.sub, fontSize: 26, marginTop: 24, maxWidth: 580 }}>
            Add Customers, Partners and Consultants in seconds. Open the tab, tap +, fill in the details and save.
          </div>
          <div style={{ marginTop: 36, display: "flex", gap: 14, flexWrap: "wrap" }}>
            {TABS.map((t, i) => (
              <div key={t} style={{
                padding: "10px 18px", borderRadius: 999,
                background: activeTab === i ? C.primary : C.card,
                border: `1px solid ${activeTab === i ? C.primary : C.line}`,
                color: activeTab === i ? "#0B1020" : C.sub,
                fontFamily: inter, fontSize: 18, fontWeight: 600,
                transition: "none",
              }}>{t}</div>
            ))}
          </div>
        </div>

        <div style={{ transform: `translateX(${(1 - inP) * 150}px)`, opacity: inP }}>
          <Phone>
            <div style={{ padding: 24, fontFamily: inter }}>
              {/* Tabs */}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {TABS.map((t, i) => (
                  <div key={t} style={{
                    flex: 1, textAlign: "center", padding: "10px 0", fontSize: 13, fontWeight: 600,
                    borderRadius: 10,
                    background: activeTab === i ? C.primary : "transparent",
                    color: activeTab === i ? "#0B1020" : C.sub,
                    border: `1px solid ${activeTab === i ? C.primary : C.line}`,
                  }}>{t}</div>
                ))}
              </div>

              <div style={{ marginTop: 18, fontFamily: sora, fontSize: 22, fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>New {TABS[activeTab].slice(0, -1)}</span>
                <div style={{ width: 36, height: 36, borderRadius: 999, background: C.accent, color: "#0B1020", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22 }}>+</div>
              </div>

              <Field label="Name">{nameTyped}{f > formStart && f < formStart + 50 && <Caret f={f} />}</Field>
              <Field label="Contact">{contactTyped}{f > formStart + 50 && f < formStart + 120 && <Caret f={f} />}</Field>
              <Field label="Type">{TABS[activeTab].slice(0, -1)}</Field>

              <div style={{
                marginTop: 26, height: 56, borderRadius: 14,
                background: saved ? C.accent : `linear-gradient(135deg, ${C.primary}, #7aa6ff)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 18, color: "#0B1020",
                transform: `scale(${saved ? 1 + Math.sin((f - 210) * 0.3) * 0.02 : 1})`,
              }}>
                {saved ? "✓ Saved to network" : "Save contact"}
              </div>
            </div>
          </Phone>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Caret: React.FC<{ f: number }> = ({ f }) => (
  <span style={{ opacity: Math.floor(f / 6) % 2 === 0 ? 1 : 0 }}>▍</span>
);

const Field: React.FC<{ label: string; children?: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginTop: 16 }}>
    <div style={{ color: C.sub, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
    <div style={{ marginTop: 6, height: 46, borderRadius: 12, background: C.card, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 16, color: C.text }}>{children}</div>
  </div>
);
