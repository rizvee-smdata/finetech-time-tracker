import { createHmac, timingSafeEqual } from "crypto";

const APP_ID = "time-tracker";

export async function verifySsoTokenImpl(sig: string): Promise<{ username: string; password: string }> {
  if (typeof sig !== "string" || sig.length < 8 || sig.length > 4096) {
    throw new Error("Invalid token");
  }

  const key = process.env.SSO_SIGNING_KEY;
  if (!key) throw new Error("SSO not configured");

  const dot = sig.lastIndexOf(".");
  if (dot < 1) throw new Error("Malformed token");

  const payloadB64 = sig.slice(0, dot);
  const providedSig = sig.slice(dot + 1);

  const expected = createHmac("sha256", key).update(payloadB64).digest();
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
  const iatMs = payload.iat < 10_000_000_000 ? payload.iat * 1000 : payload.iat;
  const expMs = payload.exp < 10_000_000_000 ? payload.exp * 1000 : payload.exp;
  if (typeof payload.iat !== "number" || Math.abs(now - iatMs) > 10 * 60_000) {
    throw new Error("Token expired (iat)");
  }
  if (typeof payload.exp !== "number" || expMs < now) {
    throw new Error("Token expired (exp)");
  }
  if (payload.appId && payload.appId !== APP_ID) {
    throw new Error("Wrong app");
  }
  if (typeof payload.u !== "string" || typeof payload.p !== "string") {
    throw new Error("Invalid credentials in token");
  }

  return { username: payload.u, password: payload.p };
}
