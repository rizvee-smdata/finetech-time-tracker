import { createServerFn } from "@tanstack/react-start";
import { createHmac, timingSafeEqual } from "crypto";

export const verifySsoToken = createServerFn({ method: "POST" })
  .inputValidator((data: { sig: string }) => {
    if (!data || typeof data.sig !== "string" || data.sig.length < 8 || data.sig.length > 4096) {
      throw new Error("Invalid token");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const key = process.env.SSO_SIGNING_KEY;
    if (!key) throw new Error("SSO not configured");

    const token = data.sig;
    const dot = token.lastIndexOf(".");
    if (dot < 1) throw new Error("Malformed token");

    const payloadB64 = token.slice(0, dot);
    const providedSig = token.slice(dot + 1);

    const expected = createHmac("sha256", key).update(payloadB64).digest();
    // Accept base64url, base64, or hex signatures
    let provided: Buffer;
    try {
      if (/^[0-9a-f]+$/i.test(providedSig) && providedSig.length === expected.length * 2) {
        provided = Buffer.from(providedSig, "hex");
      } else {
        const normalized = providedSig.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
        provided = Buffer.from(padded, "base64");
      }
    } catch {
      throw new Error("Invalid signature encoding");
    }
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new Error("Invalid signature");
    }

    let payload: { u: string; p: string; iat: number; appId?: string; exp: number };
    try {
      const json = Buffer.from(payloadB64, "base64").toString("utf8");
      payload = JSON.parse(json);
    } catch {
      throw new Error("Bad payload");
    }

    const now = Date.now();
    // iat may be skewed up to ~5 minutes into the future by the launcher
    if (typeof payload.iat !== "number" || Math.abs(now - payload.iat) > 10 * 60_000) {
      throw new Error("Token expired (iat)");
    }
    if (typeof payload.exp !== "number" || payload.exp < now) {
      throw new Error("Token expired (exp)");
    }
    if (typeof payload.u !== "string" || typeof payload.p !== "string") {
      throw new Error("Invalid credentials in token");
    }

    return { username: payload.u, password: payload.p };
  });
