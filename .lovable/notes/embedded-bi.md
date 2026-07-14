# Embedded BI — Implementation Note (deferred)

Goal: give admins/managers a drill-down analytics surface inside the CRM without rebuilding a full BI tool. Two viable paths — pick one when we resume.

---

## Path A — Embed Metabase (recommended, fastest to value)

Metabase is open-source, has a mature SQL + drag-drop explorer, dashboards, alerts, and signed-JWT embedding built in. Best when the customer wants "real BI" (pivot, joins, scheduled email reports).

### 1. Infrastructure
- Host Metabase separately from the app (it is a JVM service, cannot run in the Cloudflare Worker).
- Recommended: a small VM or container host (Fly.io, Railway, Hetzner, AWS Lightsail). Minimum 2 vCPU / 2 GB RAM.
- `docker-compose.yml` blueprint:
  ```yaml
  services:
    metabase:
      image: metabase/metabase:latest
      ports: ["3000:3000"]
      environment:
        MB_DB_TYPE: postgres
        MB_DB_DBNAME: metabase
        MB_DB_PORT: 5432
        MB_DB_USER: metabase
        MB_DB_PASS: ${MB_DB_PASS}
        MB_DB_HOST: metabase-db
        MB_JETTY_HOST: 0.0.0.0
        MB_SITE_URL: https://bi.<customer-domain>
        MB_EMBEDDING_SECRET_KEY: ${MB_EMBEDDING_SECRET_KEY}   # 32-byte hex
        MB_ENABLE_EMBEDDING: "true"
      depends_on: [metabase-db]
    metabase-db:
      image: postgres:16
      environment:
        POSTGRES_DB: metabase
        POSTGRES_USER: metabase
        POSTGRES_PASSWORD: ${MB_DB_PASS}
      volumes: [mb-data:/var/lib/postgresql/data]
  volumes: { mb-data: {} }
  ```
- Front it with Caddy / Cloudflare Tunnel for HTTPS on `bi.<customer-domain>`.

### 2. Connect Metabase to our Lovable Cloud (Supabase) Postgres
- In Metabase → Admin → Databases → Add database → Postgres.
- Use a **read-only** DB role (create in a migration):
  ```sql
  create role metabase_ro login password :'pw';
  grant usage on schema public to metabase_ro;
  grant select on all tables in schema public to metabase_ro;
  alter default privileges in schema public grant select on tables to metabase_ro;
  ```
- Keep RLS on — Metabase reads with a role that has SELECT; add a per-tenant filter on every question via `{{company_id}}` variable to prevent cross-tenant leakage.

### 3. Signed-JWT embedding in the CRM
- Secrets: add `METABASE_SITE_URL` and `METABASE_EMBEDDING_SECRET_KEY` via `add_secret`.
- New server fn `src/lib/bi/embed.functions.ts`:
  - Input: `{ dashboardId: number }`.
  - Middleware: `requireSupabaseAuth` + role check (`has_role(admin|manager)`).
  - Sign a JWT with `resource: { dashboard: id }`, `params: { company_id: <caller's companyId> }`, `exp: now + 10min`.
  - Return `${METABASE_SITE_URL}/embed/dashboard/${jwt}#bordered=false&titled=false&theme=night`.
- Route `src/routes/_authenticated/reports.bi.$dashboardId.tsx`:
  - Loads the URL from the server fn.
  - Renders a full-height `<iframe>` with `sandbox="allow-scripts allow-same-origin allow-forms"`.
- Add a "BI dashboards" section in `AppShell` sidebar under Reports, with a small admin page listing configured dashboards (store list in a `bi_dashboards` table: `id, metabase_dashboard_id, title, description, min_role`).

### 4. SSO (optional but recommended for editing)
- Metabase Enterprise supports SAML/JWT SSO; open-source supports JWT SSO too.
- Reuse the existing SAML endpoint (`src/lib/sso.functions.ts`) — map our `admin` / `manager` roles to Metabase groups.
- Non-admins only ever see the signed embedded iframe (no login).

### 5. Ops checklist
- Nightly Postgres backup of the Metabase app DB.
- Alert on Metabase container health.
- Rotate `MB_EMBEDDING_SECRET_KEY` yearly; server fn reads from env so rotation is a redeploy.

### Effort
~2 days: infra + read-only role + signed-embed server fn + route + one seeded dashboard.

---

## Path B — Native drill-down explorer (no external service)

Build on top of what we already have (`analytics.entity-explorer` pattern, `computeAttribution`, existing report routes). Best when we don't want another service to operate.

### Scope
- **Saved queries**: table `bi_saved_queries` (`id, company_id, name, entity, filters jsonb, group_by[], metrics[], chart_type, created_by`).
- **Query runner** server fn: whitelisted entities (leads, deals, visits, activities, quotes, contracts) → builds a parameterised Supabase query (never raw SQL from client) → returns rows + aggregates.
- **Chart builder UI**: shadcn + Recharts. Field pickers derived from `crm_custom_field_defs` + a static registry per entity.
- **Dashboards**: table `bi_dashboards` + `bi_dashboard_tiles` (position, size, saved_query_id). Grid layout via `react-grid-layout`.
- **Scheduled snapshots**: pg_cron nightly → materialise heavy queries into `bi_snapshots` for fast dashboards.
- **Export**: CSV + PDF (reuse `src/lib/proposals/pdfExport.ts` pattern).

### Effort
~1.5–2 weeks. More control, no infra, but we own every feature Metabase gives for free (pivot, filters UI, alerts).

---

## Decision criteria

| Need | Pick |
|---|---|
| Customer already asks for "BI / Looker / Power BI-like" | Metabase (A) |
| Small in-app charts, tight design integration | Native (B) |
| No new infra allowed | Native (B) |
| Non-technical users must build their own charts | Metabase (A) |
| Multi-tenant SaaS with strict data isolation | Metabase (A) with per-tenant `{{company_id}}` embed param + read-only role |

## Prerequisites before we build
- Confirm hosting target for Metabase (customer VM vs our shared infra).
- Confirm SSO requirement (JWT is fine; SAML needs Enterprise).
- Decide first 3 dashboards to seed: **Sales pipeline health**, **Rep activity**, **Revenue attribution deep-dive** (complements `/reports/attribution`).

## Files to create when we resume
- `supabase/migrations/<ts>_bi_readonly_role.sql`
- `supabase/migrations/<ts>_bi_dashboards.sql` (registry table + RLS + GRANTs)
- `src/lib/bi/embed.functions.ts`
- `src/routes/_authenticated/reports.bi.tsx` (list)
- `src/routes/_authenticated/reports.bi.$dashboardId.tsx` (iframe host)
- `src/routes/_authenticated/admin.bi.tsx` (register dashboards)
- Sidebar entry in `src/components/AppShell.tsx`
- Secrets: `METABASE_SITE_URL`, `METABASE_EMBEDDING_SECRET_KEY`
