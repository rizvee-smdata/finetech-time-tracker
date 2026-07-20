# Hostinger + self-hosted Supabase migration runbook

This project runs on Lovable Cloud (Cloudflare Workers SSR + Lovable-managed
Supabase, AI Gateway, and email queue). To sell it as SaaS on your own infra
you need to do the following once, outside Lovable.

## 1. Runtime: Cloudflare Workers → Node

`vite.config.ts` currently uses `@lovable.dev/vite-tanstack-config`, which
adds the Cloudflare Vite plugin. On Hostinger VPS:

```ts
// vite.config.ts (post-migration)
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart({ target: "node-server" }),
    react(),
    tailwind(),
    tsconfigPaths(),
  ],
});
```

Remove `wrangler.jsonc` and any Cloudflare-specific config. Node 20+ on the VPS.
Process manager: PM2 or systemd. Nginx in front for TLS + gzip.

## 2. Replace LOVABLE_API_KEY

All AI calls go through `src/lib/ai-gateway.ts` and its callers. Replace with
direct Gemini or OpenAI keys:

- `GEMINI_API_KEY` / `OPENAI_API_KEY` in the VPS `.env`
- Update `ai-gateway.ts` to call the provider SDK directly instead of the
  Lovable proxy.

## 3. Replace Lovable Email queue

Files under `src/routes/lovable/email/*` and the `pgmq` queues + `email_queue_dispatch()`
cron function all depend on Lovable's queue processor. Options:

- **Simple:** swap to Resend (or SES) and call their API directly from
  `sendTrialNotice` and any transactional email helper. Drop the pgmq queues.
- **Keep queue:** rewrite `email_queue_dispatch` to POST to your own Node
  endpoint that talks to Resend/SES.

Update `app_config.base_url` and `app_config.supabase_functions_url` to your
new domain via SQL after cutover.

## 4. Self-hosted Supabase

- Docker Compose from `supabase/supabase`. 2 vCPU / 4 GB RAM minimum.
- Copy the schema: run every file under `supabase/migrations/` against the new
  DB in order.
- Copy the data: `pg_dump` from the Lovable-managed DB, `pg_restore` into the
  new one.
- Regenerate types: `supabase gen types typescript` and drop into
  `src/integrations/supabase/types.ts`.
- Update `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## 5. Per-tenant secrets model

Decide **platform-paid** vs **tenant-paid** for each of these before pricing:

| Service | Recommended |
|---|---|
| AI (Gemini/OpenAI) | platform-paid, metered per tenant via `plan_limits.ai_calls_per_month` |
| Transactional email | platform-paid (Resend/SES) |
| WhatsApp (Wati) | tenant-paid — already per-tenant via `whatsapp_settings` |
| Gmail sync | tenant-paid — already per-tenant via `company_gmail_config` |
| Twilio (future) | tenant-paid |
| Payment | platform-paid |

## 6. Custom domains per tenant

Post-migration. Two ways:

- **Subdomains:** `acme.yourapp.com`, `beta.yourapp.com` — wildcard DNS + wildcard
  Let's Encrypt cert. App reads `Host` header and maps to `companies.slug`.
- **Full custom domains:** each tenant CNAMEs `crm.theircompany.com` to your
  edge. Automate certs with acme.sh or Caddy. Add a `company_domains` table.

## 7. Cutover checklist

1. Freeze writes on Lovable (put app in maintenance via `companies.maintenance_mode`).
2. Final `pg_dump` → restore into new Supabase.
3. Update `app_config` row (`base_url`, `supabase_functions_url`, `supabase_anon_key`).
4. Point DNS to Hostinger VPS.
5. Verify: sign-in, one lead create, one visit check-in, one email send.
6. Unfreeze.

## 8. What's already ready

- Multi-tenant schema, RLS, and cross-tenant leaks are closed.
- `handle_new_user` no longer promotes the first user to super-admin.
- DB functions read Lovable-specific URLs from `app_config` — flip one row on cutover.
- `plan` + `plan_limits` on `companies` for future billing enforcement.
- Trial signup is rate-limited.
- Legal pages (`/terms`, `/privacy`, `/dpa`) and data export (`/settings/export`) exist.
