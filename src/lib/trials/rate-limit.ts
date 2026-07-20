// Rate limiting for the public trial signup endpoint.
// Blocks >3 attempts per IP per hour or >2 attempts per email per day.
export async function assertTrialRateLimit(
  supabaseAdmin: any,
  opts: { ipHash: string | null; email: string },
): Promise<void> {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  if (opts.ipHash) {
    const { count } = await supabaseAdmin
      .from("trial_signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", opts.ipHash)
      .gte("attempted_at", hourAgo);
    if ((count ?? 0) >= 3) {
      throw new Error("Too many trial requests from your network. Try again in an hour.");
    }
  }

  const { count: emailCount } = await supabaseAdmin
    .from("trial_signup_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email", opts.email)
    .gte("attempted_at", dayAgo);
  if ((emailCount ?? 0) >= 2) {
    throw new Error("A trial for this email was already requested recently. Check your inbox.");
  }

  await supabaseAdmin.from("trial_signup_attempts").insert({
    ip_hash: opts.ipHash,
    email: opts.email,
  });
}

export async function hashIp(ip: string): Promise<string> {
  const buf = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
