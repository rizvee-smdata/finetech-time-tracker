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

    const expectedSig = createHmac("sha256", key).update(payloadB64).digest("hex");
    const a = Buffer.from(providedSig, "hex");
    const b = Buffer.from(expectedSig, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
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
    if (typeof payload.iat !== "number" || now - payload.iat > 5 * 60_000) {
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
