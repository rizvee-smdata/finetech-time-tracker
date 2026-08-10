/** Server-only ERP/accounting provider adapters. Never import from the browser. */

export type PushResult = { ok: boolean; externalId?: string; message: string; raw?: unknown };

type Conn = {
  provider: string;
  config: Record<string, any>;
  default_currency?: string | null;
};

const XERO_GATEWAY = "https://connector-gateway.lovable.dev/xero";

function envToken(name?: string): string | undefined {
  if (!name) return undefined;
  return process.env[name] || undefined;
}

async function xeroHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["XERO_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error("Xero is not connected yet. Connect the Xero integration first, then retry.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function xeroTenantId(configured?: string): Promise<string> {
  if (configured) return configured;
  const res = await fetch(`${XERO_GATEWAY}/connections`, { headers: await xeroHeaders() });
  if (!res.ok) throw new Error(`Could not list Xero organisations (${res.status})`);
  const rows = (await res.json()) as Array<{ tenantId?: string }>;
  const id = rows?.[0]?.tenantId;
  if (!id) throw new Error("No Xero organisation is available for this connection.");
  return id;
}

/** Ping the provider so the admin can verify the setup. */
export async function testConnection(conn: Conn): Promise<PushResult> {
  if (conn.provider === "xero") {
    const res = await fetch(`${XERO_GATEWAY}/connections`, { headers: await xeroHeaders() });
    if (!res.ok) return { ok: false, message: `Xero responded ${res.status}` };
    const rows = (await res.json()) as Array<{ tenantId?: string; tenantName?: string }>;
    return { ok: true, message: `Connected to ${rows?.[0]?.tenantName ?? "Xero"} (${rows?.length ?? 0} org(s))` };
  }
  const endpoint = conn.config?.endpoint as string | undefined;
  if (!endpoint) return { ok: false, message: "No endpoint configured." };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: outboundHeaders(conn),
    body: JSON.stringify({ type: "ping", at: new Date().toISOString() }),
  });
  return {
    ok: res.ok,
    message: res.ok ? `Endpoint replied ${res.status}` : `Endpoint replied ${res.status}`,
  };
}

function outboundHeaders(conn: Conn): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const token = envToken(conn.config?.token_env);
  if (token) headers[(conn.config?.auth_header_name as string) || "Authorization"] = token;
  return headers;
}

export type InvoicePayload = {
  reference: string;
  contactName: string;
  contactEmail?: string | null;
  currency: string;
  date: string;
  dueDate?: string | null;
  lines: { description: string; quantity: number; unitAmount: number }[];
};

export async function pushInvoice(conn: Conn, invoice: InvoicePayload): Promise<PushResult> {
  if (conn.provider === "xero") {
    const tenantId = await xeroTenantId(conn.config?.tenant_id);
    const body = {
      Invoices: [
        {
          Type: "ACCREC",
          Reference: invoice.reference,
          Contact: { Name: invoice.contactName, ...(invoice.contactEmail ? { EmailAddress: invoice.contactEmail } : {}) },
          Date: invoice.date,
          ...(invoice.dueDate ? { DueDate: invoice.dueDate } : {}),
          CurrencyCode: invoice.currency,
          Status: "DRAFT",
          LineItems: invoice.lines.map((l) => ({
            Description: l.description,
            Quantity: l.quantity,
            UnitAmount: l.unitAmount,
            ...(conn.config?.account_code ? { AccountCode: conn.config.account_code } : {}),
          })),
        },
      ],
    };
    const res = await fetch(`${XERO_GATEWAY}/api.xro/2.0/Invoices`, {
      method: "POST",
      headers: { ...(await xeroHeaders()), "xero-tenant-id": tenantId },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: `Xero rejected the invoice (${res.status})`, raw: json };
    const created = (json as any)?.Invoices?.[0];
    return { ok: true, externalId: created?.InvoiceID ?? created?.InvoiceNumber, message: "Draft invoice created in Xero", raw: json };
  }

  const endpoint = conn.config?.endpoint as string | undefined;
  if (!endpoint) return { ok: false, message: "No endpoint configured for this connection." };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: outboundHeaders(conn),
    body: JSON.stringify({ type: "invoice.create", provider: conn.provider, invoice }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, message: `Endpoint replied ${res.status}`, raw: json };
  return { ok: true, externalId: (json as any)?.id ?? (json as any)?.external_id, message: "Invoice sent", raw: json };
}

export type CustomerPayload = { name: string; email?: string | null; phone?: string | null; address?: string | null };

export async function pushCustomer(conn: Conn, customer: CustomerPayload): Promise<PushResult> {
  if (conn.provider === "xero") {
    const tenantId = await xeroTenantId(conn.config?.tenant_id);
    const res = await fetch(`${XERO_GATEWAY}/api.xro/2.0/Contacts`, {
      method: "POST",
      headers: { ...(await xeroHeaders()), "xero-tenant-id": tenantId },
      body: JSON.stringify({
        Contacts: [
          {
            Name: customer.name,
            ...(customer.email ? { EmailAddress: customer.email } : {}),
            ...(customer.phone ? { Phones: [{ PhoneType: "DEFAULT", PhoneNumber: customer.phone }] } : {}),
          },
        ],
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: `Xero rejected the contact (${res.status})`, raw: json };
    return { ok: true, externalId: (json as any)?.Contacts?.[0]?.ContactID, message: "Contact synced to Xero", raw: json };
  }
  const endpoint = conn.config?.endpoint as string | undefined;
  if (!endpoint) return { ok: false, message: "No endpoint configured for this connection." };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: outboundHeaders(conn),
    body: JSON.stringify({ type: "customer.upsert", provider: conn.provider, customer }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, message: `Endpoint replied ${res.status}`, raw: json };
  return { ok: true, externalId: (json as any)?.id ?? (json as any)?.external_id, message: "Customer sent", raw: json };
}
