# Lavisho TT Landing Page + Trial Request Flow

## 1. Public landing page at `/`

Replace the current `/` redirect with a real marketing page. The route becomes public; only authenticated visitors who arrive at `/` get redirected to `/dashboard`.

**Sections**

- Top nav: Lavisho TT logo (left), links (Features, Reels, Pricing, FAQ), `Sign in` button + `Start free trial` CTA (right) — same top-bar pattern as Lavisho HR.
- Hero: headline, subhead, `Start 7-day free trial` primary CTA, `Sign in` secondary, product screenshot mock.
- Features grid (highlights of the actual app):
  - Field check-in with GPS geofence + selfie/voice
  - CRM: leads, pipeline, quotes, forecasts
  - Task management (board, list, calendar, gantt)
  - Attendance & expenses with approvals
  - AI Copilot: anomalies, briefings, coaching
  - Reports, analytics, and route planning
- Product reels: 3–4 short auto-playing muted `<video>` loops (check-in flow, CRM pipeline, task board, AI copilot). Placeholder video sources with graceful poster fallback so it renders before assets are added; the user can drop in real MP4s later.
- Pricing: two tiers — **Professional** and **Enterprise** — with feature checklist, per-user/month pricing, and "Start trial" / "Contact sales" CTAs.
- FAQ (accordion): trial length, data security, cancellation, migration.
- Footer: company, legal, contact.

Head metadata: real title, description, `og:*`, `twitter:card`, `og:image` from a generated hero.

## 2. 7-day trial request flow

Anyone can request a trial from the landing page. Flow:

1. User submits `full_name`, `work_email`, `company_name`, `phone`, `country`, `team_size`, `notes` on `/trial`.
2. Row inserted into `trial_requests` with status `pending_email_verification` and a random `verification_token` (48-char).
3. System email sends `Verify your email` link → `/trial/verify?token=…`.
4. Verifying flips status to `pending_approval`, clears token, records `email_verified_at`.
5. Super-admin notification email + in-app queue entry lands in `/admin/trial-requests`.
6. Super admin approves or rejects with an optional note.
   - **Approve**: create a `companies` row (if new), create the requester's `auth.users` account via admin API with a temporary password, insert `profiles`, add to `company_members`, set `trial_ends_at = now() + 7 days` on the company, email the user a magic sign-in link.
   - **Reject**: mark rejected, email the user the reason.
7. All state transitions logged.

## 3. Super-admin queue UI

- New route `_authenticated/admin.trial-requests.tsx`, visible only when `isSuperAdmin`.
- Table of pending → approved/rejected requests with filter tabs, request detail drawer with `Approve` / `Reject (with reason)` buttons, and history of resolved requests.
- Menu item added to the admin nav for super admins only.

## 4. Server functions & routes

- `src/lib/trials/request.functions.ts`
  - `submitTrialRequest` — public server fn, validates + inserts row, enqueues verification email. Rate-limited by IP + email.
  - `verifyTrialEmail` — public server fn, consumes token, flips status.
  - `approveTrialRequest` / `rejectTrialRequest` — protected server fns gated by `has_role(super_admin)` (uses `supabaseAdmin` inside handler); create user, company, membership, send outcome email.
- Verification link route `src/routes/trial/verify.tsx` — public leaf route that calls `verifyTrialEmail`.
- Public marketing routes: `src/routes/index.tsx` (landing), `src/routes/trial/index.tsx` (request form), `src/routes/trial/verify.tsx`.
- Email templates via `email-templates`: `trial-verify`, `trial-submitted-admin`, `trial-approved`, `trial-rejected`.

## 5. Database migration

New table `public.trial_requests`:

- domain fields: `full_name`, `work_email` (unique per pending), `company_name`, `phone`, `country`, `team_size`, `notes`, `status` (`pending_email_verification` | `pending_approval` | `approved` | `rejected`), `verification_token`, `email_verified_at`, `reviewed_by`, `reviewed_at`, `rejection_reason`, `created_company_id`, `trial_ends_at`.
- GRANTs: `INSERT` to `anon` + `authenticated` (submissions), `SELECT/UPDATE` to `authenticated` gated by RLS.
- RLS: anon insert only if status is `pending_email_verification`; super admins see/update everything; requester sees only their own by matching `work_email` to `auth.users.email` once signed in.
- Trigger to auto-set `updated_at`.

Add nullable `trial_ends_at timestamptz` on `companies` so approvals can stamp it.

## 6. Auth & routing changes

- Root route (`__root.tsx`) already public; keep as-is.
- Update `src/routes/index.tsx` from redirect-only to landing component; if session exists, still redirect to `/dashboard` in `beforeLoad`.
- Add `/trial` and `/trial/verify` as public routes outside `_authenticated`.
- Nav: `/admin/trial-requests` menu item guarded by `isSuperAdmin`.

## 7. Design & assets

- Generate a hero image + 3 feature cards via imagegen (premium for hero, fast for cards). Reels get placeholder poster images now; MP4 URLs left as config so real recordings can be swapped in.
- Landing uses existing design tokens (`bg-background`, `text-foreground`, `primary`) — no hard-coded colors.

## 8. Verification

- Build passes typecheck.
- Playwright smoke: visit `/`, submit trial form, verify email link updates status, super admin approves, resulting user can sign in with emailed link.

---

## Technical notes (for engineers)

- Trial email delivery uses the existing Lovable Emails infrastructure (`enqueue_email` + templates registered in `email-templates/registry.ts`).
- Super-admin server fns call `has_role`/`is_super_admin` check first, then load `supabaseAdmin` inside handler.
- `submitTrialRequest` uses server publishable client + `TO anon INSERT` policy — no admin key on public path.
- Approvals use `supabaseAdmin.auth.admin.createUser` with `email_confirm: true`, then `generateLink({ type: 'magiclink' })` to email the sign-in link.

Confirm to proceed and I'll implement.
