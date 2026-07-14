# Enterprise CRM Gap-Closure Plan

Phased plan to ship the 10 gaps identified in the audit. Each phase groups items that share infrastructure so we build once and reuse.

---

## Phase 1 — Automation Core (weeks 1-2)

### 1. Visual Workflow Builder (conditional, multi-step)
- New tables: `workflows`, `workflow_steps`, `workflow_runs`, `workflow_run_steps`
- Trigger types: record created/updated (lead, deal, visit), schedule, webhook, manual
- Step types: condition (if/else), delay, assign, update field, send email/WhatsApp, create task, call webhook, require approval
- UI: React Flow canvas at `/settings/workflows` — drag steps, wire branches, test-run panel
- Runner: `createServerFn` `runWorkflow` + pg_cron every minute for delayed steps
- Reuse existing: sequences engine, reminders, approval_logs

### 2. Rule-Based Lead Routing / Round-Robin
- New tables: `lead_routing_rules` (conditions JSON, assignment strategy), `lead_routing_state` (round-robin cursor per rule)
- Strategies: round-robin, load-balanced (fewest open leads), territory match, weighted
- Trigger: DB trigger on `crm_leads` insert → server fn evaluates rules → sets `assigned_to`
- Admin UI: `/crm/settings` → Routing Rules tab (conditions builder, assignee pool, priority order)
- Piggybacks on Phase-1 workflow builder for condition UI

---

## Phase 2 — Voice & Multi-channel (weeks 3-4)

### 3. Telephony/CTI + Call Transcription
- Provider: Twilio Voice (existing pattern) — click-to-call widget in lead/deal pages
- Server route `/api/public/hooks/twilio-recording` receives recording URL
- Transcribe with Lovable AI Gateway (Whisper-compatible)
- Store on `crm_call_logs` (add `recording_url`, `transcript`, `ai_summary`, `sentiment`, `next_actions`)
- Auto-analyze: extract objections, competitors mentioned, commitments; surface in `AIInsightsPanel`
- Secret: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_APP_SID`

### 4. Outlook Sync + SMS + Web Chat
- **Outlook**: App User Connector (`microsoft_outlook`) — mirror gmail sync pattern (`gmail/sync.server.ts` → `outlook/sync.server.ts`)
- **SMS**: Twilio Messaging (share credentials with #3), unify with WhatsApp send API behind `sendMessage({ channel })`
- **Web Chat**: Public embeddable widget at `/api/public/chat/widget.js` + `chat_sessions`/`chat_widget_messages` tables; conversations land in `crm.inbox` and auto-create leads via existing `crm-lead-capture` hook

---

## Phase 3 — Enterprise Financials (week 5)

### 5. Multi-Currency
- New tables: `currencies` (ISO code, symbol), `exchange_rates` (from, to, rate, as_of)
- Add `currency_code` to `crm_leads`, `crm_quotes`, `crm_quote_line_items`, `contracts`, `contract_payments`, `expenses`, `crm_targets`
- Company setting: base currency; conversions computed on read via SQL view `v_deals_in_base_currency`
- Daily pg_cron pulls rates from openexchangerates.org (secret: `OPENEXCHANGERATES_APP_ID`)
- UI: currency selector on quote/deal forms; forecast/target dashboards show base + native

---

## Phase 4 — Integration & API (weeks 6-7)

### 6. ERP Connectors + Public REST API
- **Public REST API** at `/api/v1/*` (leads, accounts, deals, contracts, quotes)
  - Auth: personal access tokens (`api_tokens` table, hashed) + `Authorization: Bearer`
  - Zod-validated; rate-limited per token; audit-logged
  - OpenAPI 3.1 spec generated from Zod → served at `/api/v1/openapi.json` + Swagger UI at `/settings/api`
- **ERP connectors** (adapter pattern in `src/lib/erp/`):
  - SAP Business One (Service Layer REST)
  - Oracle NetSuite (SuiteTalk REST)
  - Odoo (JSON-RPC)
  - Sync direction & field mapping configured per company; queue in `erp_sync_jobs`
- Reuse workflow builder step "Push to ERP" and "Pull from ERP"

### 7. Sandbox Environments
- Per-company `environment` column (`production` | `sandbox`) on `companies`
- Sandbox = full schema clone, isolated by RLS on `environment_id`
- One-click "Refresh sandbox from production" server fn (copies rows, resets IDs)
- Header banner + subdomain hint when in sandbox

---

## Phase 5 — Extensibility (weeks 8-9)

### 8. Custom Objects + Plugin Marketplace
- **Custom objects**: extend `crm_custom_field_defs` pattern to full entities
  - `custom_object_defs` (name, plural, icon), `custom_object_records` (jsonb payload), `custom_object_field_defs`
  - Auto-generated list/detail/form UI + RLS scoped to company
  - Relations to standard objects (lead, account, deal)
- **Plugin marketplace**:
  - `plugins` table (manifest JSON: routes, hooks, permissions)
  - Signed manifest, installed per company
  - Sandboxed iframe host for plugin UI + narrow server fn API surface
  - Starter plugins: DocuSign, Slack notifier, Xero invoice sync

---

## Phase 6 — Mobile & BI (week 10)

### 9. Offline Mobile Sync
- Service worker (`vite-plugin-pwa`) with Workbox queue plugin
- Local IndexedDB (Dexie) for offline reads of: leads, visits, tasks, customers
- Mutation queue: check-ins, visit reports, notes stored offline; auto-replay on reconnect with conflict resolution (last-write-wins + audit log entry)
- "Offline" indicator in `AppShell`; visible pending-sync count

### 10. Embedded BI + Revenue Attribution
- **BI**: embed Metabase (self-hosted docker-compose blueprint) — SSO via existing SAML; embed dashboards as signed JWT iframes at `/reports/bi/:dashboardId`
- Alternative: build native drill-down explorer on existing `analytics.entity-explorer` with saved-query + chart-builder UI
- **Revenue attribution**:
  - New table `attribution_touchpoints` (deal_id, source, channel, campaign, weight, ts)
  - Auto-capture from: lead source, email opens, WhatsApp replies, visits, calls
  - Models: first-touch, last-touch, linear, time-decay, U-shaped
  - Dashboard at `/reports/attribution`

---

## Technical Details

**Shared infrastructure built in early phases and reused:**
- Condition builder component (Phase 1) → reused by routing rules, attribution filters, plugin triggers
- Message send abstraction (Phase 2) → email/SMS/WhatsApp/webhook one API
- Adapter pattern in `src/lib/erp/` (Phase 4) → same shape as `src/lib/gmail/`, `src/lib/outlook/`

**Naming conventions:**
- Tables: `workflow_*`, `lead_routing_*`, `outlook_*`, `currencies`, `exchange_rates`, `api_tokens`, `erp_*`, `custom_object_*`, `plugins`, `attribution_*`
- Every new public table gets GRANT + RLS in the same migration
- Server fns in `src/lib/<feature>/*.functions.ts`; server-only helpers in `*.server.ts`

**Secrets to request:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_APP_SID`, `OPENEXCHANGERATES_APP_ID`, plus per-ERP creds when a customer activates.

**Estimated effort:** ~10 weeks for one full-stack pair; can parallelize Phase 2 (channels) with Phase 3 (currency) since they don't overlap.

---

## Suggested Kick-off Order

If we can only start one thing now, I recommend **Phase 1 (Workflow Builder + Lead Routing)** — biggest enterprise-deal unlock and its condition/action primitives are reused by 4 later phases.

Tell me which phase (or single item) to build first, or approve the plan and I'll start Phase 1.
