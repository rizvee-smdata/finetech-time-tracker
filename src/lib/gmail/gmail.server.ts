// Server-only Gmail helpers: OAuth token refresh + REST calls.
// Never imported from client files.

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

export type GmailAccountRow = {
  user_id: string;
  gmail_address: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  status: string;
};

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  workspaceDomain: string;
};

export async function getCompanyGoogleConfig(
  supabaseAdmin: any,
  companyId: string,
): Promise<GoogleConfig> {
  const { data, error } = await supabaseAdmin
    .from("company_gmail_config")
    .select("client_id,client_secret,workspace_domain,enabled")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load Gmail config: ${error.message}`);
  if (!data) {
    throw new Error(
      "Gmail is not configured for this company. An admin must add the Google Client ID, Secret and Workspace domain in Settings → Integrations.",
    );
  }
  if (!data.enabled) throw new Error("Gmail integration is disabled for this company.");
  if (!data.client_id || !data.client_secret || !data.workspace_domain) {
    throw new Error("Gmail config is incomplete. An admin must fill in all fields.");
  }
  return {
    clientId: data.client_id,
    clientSecret: data.client_secret,
    workspaceDomain: data.workspace_domain,
  };
}

export function buildCallbackUrl(origin: string) {
  return `${origin}/api/public/gmail/callback`;
}

export function buildAuthUrl(opts: {
  origin: string;
  state: string;
  config: GoogleConfig;
}) {
  const params = new URLSearchParams({
    client_id: opts.config.clientId,
    redirect_uri: buildCallbackUrl(opts.origin),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    hd: opts.config.workspaceDomain,
    state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}


export async function exchangeCodeForTokens(
  code: string,
  origin: string,
  config: GoogleConfig,
) {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: buildCallbackUrl(origin),
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
    id_token?: string;
  };
}

export async function refreshAccessToken(refreshToken: string, config: GoogleConfig) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return (await res.json()) as { access_token: string; expires_in: number };
}


export async function getGmailProfile(accessToken: string) {
  const res = await fetch(`${GMAIL_API}/users/me/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail profile fetch failed: ${await res.text()}`);
  return (await res.json()) as { emailAddress: string; historyId: string };
}

// Get fresh access token for a user (refreshes if expiring within 60s).
export async function getFreshToken(
  supabaseAdmin: any,
  userId: string,
): Promise<{ accessToken: string; gmailAddress: string } | null> {
  const { data: acc } = await supabaseAdmin
    .from("gmail_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!acc || acc.status === "disconnected" || !acc.refresh_token) return null;
  const expires = acc.token_expires_at ? new Date(acc.token_expires_at).getTime() : 0;
  if (acc.access_token && expires - Date.now() > 60_000) {
    return { accessToken: acc.access_token, gmailAddress: acc.gmail_address };
  }
  try {
    if (!acc.company_id) throw new Error("Gmail account is missing company assignment.");
    const config = await getCompanyGoogleConfig(supabaseAdmin, acc.company_id);
    const tk = await refreshAccessToken(acc.refresh_token, config);
    const newExpiry = new Date(Date.now() + tk.expires_in * 1000).toISOString();
    await supabaseAdmin
      .from("gmail_accounts")
      .update({
        access_token: tk.access_token,
        token_expires_at: newExpiry,
        status: "connected",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return { accessToken: tk.access_token, gmailAddress: acc.gmail_address };
  } catch (e: any) {
    await supabaseAdmin
      .from("gmail_accounts")
      .update({ status: "error", last_error: String(e?.message ?? e) })
      .eq("user_id", userId);
    return null;
  }
}

export type GmailMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  bodyPreview: string;
  sentAt: string;
  hasAttachments: boolean;
};

function decodeBase64Url(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(b64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}
function extractPlainBody(payload: any): { body: string; hasAttachments: boolean } {
  let body = "";
  let hasAttachments = false;
  const walk = (p: any) => {
    if (!p) return;
    if (p.filename && p.filename.length > 0) hasAttachments = true;
    if (p.mimeType === "text/plain" && p.body?.data && !body) {
      body = decodeBase64Url(p.body.data);
    }
    if (Array.isArray(p.parts)) p.parts.forEach(walk);
  };
  walk(payload);
  return { body: body.slice(0, 2000), hasAttachments };
}
function headerVal(headers: any[], name: string) {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}
function parseAddressList(v: string): string[] {
  return v
    .split(",")
    .map((s) => {
      const m = s.match(/<([^>]+)>/);
      return (m ? m[1] : s).trim().toLowerCase();
    })
    .filter(Boolean);
}
function extractSingleAddress(v: string): string {
  const m = v.match(/<([^>]+)>/);
  return (m ? m[1] : v).trim().toLowerCase();
}

export async function searchGmail(
  accessToken: string,
  query: string,
  maxResults = 50,
): Promise<string[]> {
  const url = `${GMAIL_API}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 429) throw new Error("rate_limited");
  if (!res.ok) throw new Error(`Gmail search failed: ${await res.text()}`);
  const j = await res.json();
  return (j.messages ?? []).map((m: any) => m.id);
}

export async function getGmailMessage(accessToken: string, id: string): Promise<GmailMessage> {
  const url = `${GMAIL_API}/users/me/messages/${id}?format=full`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 429) throw new Error("rate_limited");
  if (!res.ok) throw new Error(`Gmail get failed: ${await res.text()}`);
  const m = await res.json();
  const headers = m.payload?.headers ?? [];
  const from = extractSingleAddress(headerVal(headers, "From"));
  const to = parseAddressList(headerVal(headers, "To"));
  const cc = parseAddressList(headerVal(headers, "Cc"));
  const subject = headerVal(headers, "Subject");
  const dateHdr = headerVal(headers, "Date");
  const sentAt = dateHdr ? new Date(dateHdr).toISOString() : new Date(Number(m.internalDate)).toISOString();
  const { body, hasAttachments } = extractPlainBody(m.payload);
  return {
    id: m.id,
    threadId: m.threadId,
    from,
    to: [...to, ...cc],
    subject,
    snippet: m.snippet ?? "",
    bodyPreview: body,
    sentAt,
    hasAttachments,
  };
}

export function buildContactQuery(emails: string[], sinceDays = 180): string[] {
  // Chunk to 15 contacts per query (Gmail query length + OR limits).
  const chunks: string[][] = [];
  for (let i = 0; i < emails.length; i += 15) chunks.push(emails.slice(i, i + 15));
  return chunks.map((chunk) => {
    const parts = chunk.flatMap((e) => [`from:${e}`, `to:${e}`]);
    return `(${parts.join(" OR ")}) newer_than:${sinceDays}d`;
  });
}
