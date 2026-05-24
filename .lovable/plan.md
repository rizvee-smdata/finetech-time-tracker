# Master Integration Plan — DeskIQ

This is a large, cross-cutting change touching every module. I'll build it in 7 focused phases so the app keeps compiling after each phase. Lovable AI Gateway (Gemini) is used for the morning briefing — no Anthropic key needed.

## Phase 1 — Unified state + global search

- New `src/lib/app/DeskIQContext.tsx`
  - `useReducer` over `{ meetings, deals, timeEntries, timerState, projectBudgets, proposals, notifications, settings, dailyBriefing, briefingDate }`
  - Hydrates from each module's existing localStorage stores (no data migration); persists the *composite* under `deskiq_state` and re-syncs sub-stores on change so existing components keep working.
  - Cross-module action creators: `meetingProcessed`, `timerStopped`, `proposalStatusChanged`, `actionCompleted`, `dealStageChanged`. Each pushes a `Notification` and recalculates affected deal health via existing `calculateHealthScore`.
- `src/lib/app/types.ts` — `Notification`, `AppSettings`, `DailyBriefing`.
- Mount provider in `src/routes/__root.tsx`.
- `src/components/global/GlobalSearch.tsx` — CMD+K palette using shadcn `Command`, searches deals / meetings / proposals / time entries / actions, grouped results with module icons → router navigate.
- Add search trigger + keyboard shortcut to `AppShell`.

## Phase 2 — Meeting ↔ Deal Health

- In `src/components/meetings/ResultsView.tsx` add a "Link to Deal" `Select` (deals from context).
- On select → dispatch `meetingProcessed({ meetingId, dealId })`:
  - Appends an `Interaction` (type derived from meeting title keywords; sentiment from meeting sentiment; notes = summary).
  - Recalculates `DealHealth`, toast `Deal health updated: {name} {prev} → {new} {emoji}`.

## Phase 3 — Meeting → Proposal & Deal → Proposal

- Add "📄 Start Proposal from This Meeting" button in `ResultsView` → navigates to `/proposals/new?fromMeeting=<id>`.
- Add "📄 Generate Proposal for This Deal" on `deals.$dealId.tsx` → `/proposals/new?fromDeal=<id>`.
- Extend `proposals.new.tsx` wizard to read those search params and pre-fill client info, pain points, objections, context (meeting) or CRM fields + products + competitor + NBA context (deal) via the wizard draft store.

## Phase 4 — Time Tracker → Deal Health

- In time `storage.ts` stop-timer flow (or via context dispatch `timerStopped`):
  - If `dealId` set: increment `deal.totalMinutes`, recompute `revenuePerHour = value / hours`, push budget alert if `hours > budget.budgetedHours * threshold`, recalculate health (adds an `Interaction` of type "work logged" with neutral sentiment so recency/engagement reflect activity).
- `HoursValueScatter` already reads from store → updates live.

## Phase 5 — Proposal → Deal stage

- Hook `useProposalsStore.updateStatus` to dispatch `proposalStatusChanged`:
  - `sent` → set deal stage `Proposal`.
  - `accepted` → stage `Closed Won` + confetti (lightweight inline canvas, no new dep) + win note.
  - `rejected` → stage `Closed Lost` + open a small `WinLossNoteDialog`.
  - Each recalculates health and emits a notification.

## Phase 6 — Action Item → Time Tracker

- `NextBestActionCard` / `ActionCenterList`: add "⏱️ Start Timer" button → `timerStore.start({ description: action.title, dealId, category: mapActionTypeToCategory(action.type) })` and navigate to `/time`.

## Phase 7 — Home / Notifications / Settings

- New `src/routes/_authenticated/index.tsx` (replace the current landing for authed users):
  - `MorningBriefingCard` — server fn `generateBriefing` calls Lovable AI Gateway (`google/gemini-2.5-flash`) with the data snapshot, returns the JSON described in the prompt, cached per `briefingDate`. Manual refresh button.
  - 4-widget grid: `PipelinePulseWidget`, `TodayActionsWidget`, `LiveTimerWidget` (reuses `LiveTimer`), `ProposalPipelineWidget`.
- `NotificationCenter.tsx` — replaces the floating `AlertsBell`/`NotificationBell` combo. Sheet with categorized list (Urgent/Today/Updates/Wins), per-item dismiss + quick action, source-module badge.
- `src/routes/_authenticated/settings.tsx` with tabs: Company Profile, Team, Working Hours, Deal Config (stage names, expected days, score thresholds), Proposal Defaults, Notification Preferences. All stored in `settings` slice of context. Scoring + alert thresholds read from settings (small refactor of `scoring.ts` to accept overrides; defaults unchanged).

## Technical notes

- Single source of truth: context owns the data; sub-store hooks become thin wrappers that read/write through context so existing components don't break. Where a wholesale refactor is too risky in one pass, the context *subscribes* to sub-store changes and *also* re-dispatches into sub-stores — this keeps the integration working without rewriting every component.
- AI: Lovable AI Gateway (`LOVABLE_API_KEY` already provisioned) via existing `src/lib/ai-gateway.ts`. No new secrets.
- No DB / Supabase migrations — everything stays in localStorage as the existing modules do.
- Confetti: small inline implementation in `src/lib/ui/confetti.ts` (no new dep).
- Acceptance: after each phase I'll spot-check the build output; final pass verifies all 12 acceptance criteria.

Shall I proceed with Phase 1?
