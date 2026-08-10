export type ErpProvider = "xero" | "quickbooks" | "zoho_books" | "tally" | "generic";

export const ERP_PROVIDERS: { value: ErpProvider; label: string; hint: string }[] = [
  { value: "xero", label: "Xero", hint: "Uses the Xero connector (gateway). No endpoint needed." },
  { value: "quickbooks", label: "QuickBooks Online", hint: "Push via your middleware endpoint." },
  { value: "zoho_books", label: "Zoho Books", hint: "Push via your middleware endpoint." },
  { value: "tally", label: "Tally ERP", hint: "Push to a Tally bridge/HTTP gateway endpoint." },
  { value: "generic", label: "Generic endpoint", hint: "Any HTTPS endpoint that accepts JSON." },
];

export type ErpConnection = {
  id: string;
  company_id: string;
  provider: ErpProvider;
  name: string;
  is_active: boolean;
  config: {
    endpoint?: string;
    auth_header_name?: string;
    token_env?: string;
    tenant_id?: string;
    account_code?: string;
    [k: string]: unknown;
  };
  default_currency: string | null;
  last_sync_at: string | null;
  last_status: string | null;
  created_at: string;
};

export type ErpSyncLogRow = {
  id: string;
  connection_id: string | null;
  direction: string;
  entity_type: string;
  local_id: string | null;
  external_id: string | null;
  status: string;
  message: string | null;
  created_at: string;
};
