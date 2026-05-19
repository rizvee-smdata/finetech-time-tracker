import React from "react";
import { C } from "../theme";

export const Phone: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      width: 520,
      height: 940,
      borderRadius: 56,
      background: "#000",
      padding: 16,
      boxShadow: "0 60px 120px rgba(0,0,0,0.55), 0 0 0 2px #1f2748",
      ...style,
    }}
  >
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 44,
        background: C.bg,
        overflow: "hidden",
        position: "relative",
        color: C.text,
      }}
    >
      {children}
    </div>
  </div>
);
