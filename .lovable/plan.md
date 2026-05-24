# Time Tracker + Executive Dashboard

Adds a new top-level module to DeskIQ with four pages (Time Tracker, Timesheet, Revenue Intelligence, Executive Dashboard), plus a global Smart Alerts bell. Visuals follow the existing DeskIQ dark theme with a violet (#8B5CF6) accent for time, Recharts for all charts, and localStorage for persistence (consistent with Meetings + Deals modules).

## Data layer

`src/lib/time/types.ts` — `TimeEntry`, `TimeCategory`, `TimerState`, `DailyTarget`, `ProjectBudget`, `Alert` types per spec.

`src/lib/time/storage.ts` — `useTimeStore` hook (pub/sub + localStorage), keys:
- `deskiq_timeentries` — all entries
- `deskiq_timer_state` — running timer (survives reload)
- `deskiq_daily_target` — { total: 8, billable: 5, bd: 3 }
- `deskiq_project_budgets` — per-deal budgets
- `deskiq_briefing_cache` — daily executive briefing (date-keyed)

`src/lib/time/seed.ts` — 45 entries over last 14 days linked to the 5 seeded deals, plus 5 project budgets (2 yellow, 1 red).

`src/lib/time/classify.functions.ts` — `createServerFn` calling Lovable AI Gateway (`google/gemini-3-flash-preview`) with tool-calling `classify_time_entry` returning `{category, billable, suggestedDealId, suggestedClientName, tags, confidence}`. (Spec mentions Anthropic; we standardize on Lovable AI Gateway like Meetings/Deals — no API key required, handles 429/402 with toasts.)

`src/lib/time/briefing.functions.ts` — `createServerFn` generating the 5-point daily executive briefing from deals + actions + recent time entries.

`src/lib/time/insight.functions.ts` — `createServerFn` for the weekly Revenue Intelligence insight (4–5 paragraphs).

`src/lib/alerts/derive.ts` — pure function that derives alerts from current deals + entries + budgets (stalling, overdue, budget 75%+, close-date within 7 days, idle timer >3h).

## Routes

```text
src/routes/_authenticated/
  time.tsx              -> tab layout (Tracker / Timesheet / Revenue / Dashboard)
  time.index.tsx        -> Time Tracker (live timer + today's entries)
  time.sheet.tsx        -> Timesheet (day/week/month + heatmap + exports)
  time.revenue.tsx      -> Revenue Intelligence (4 KPIs + 3 charts + budget tracker)
  time.dashboard.tsx    -> Executive Dashboard (3-col + 3 charts + activity feed)
```

## Components (`src/components/time/`)

- `LiveTimer.tsx` — large mono `HH:MM:SS`, start/pause/stop/discard, persists state.
- `EntryForm.tsx` — description input with AI Classify (✨/Tab), suggestion pill bar, deal/category/billable/tags.
- `TodayEntriesList.tsx` — running list with edit/delete.
- `TodaySummaryBar.tsx` — totals, progress vs target, top category.
- `ManualEntryDialog.tsx` — log past work.
- `TimesheetTable.tsx` — week grid with violet intensity, totals row/column.
- `ProductivityHeatmap.tsx` — 12-week GitHub-style grid with tooltip.
- `TimesheetFilters.tsx` + `ViewToggle.tsx`.
- `ExportButtons.tsx` — CSV + PDF (jsPDF) + clipboard.
- `RevenueKPICards.tsx`, `HoursValueScatter.tsx` (Recharts ScatterChart with quadrant labels), `CategoryDonut.tsx` (with benchmark note), `BillableTrendLine.tsx`, `BudgetTracker.tsx`, `WeeklyInsightCard.tsx`.
- `MiniTimerWidget.tsx` — embedded on dashboard.
- `DailyBriefingCard.tsx` — AI 5-point briefing, refresh.
- `WeeklyActivityHeatmap.tsx` — 7×24 grid.
- `PipelineMovementChart.tsx` — bar chart (forward/back/stalled).
- `RevenueForecastGauge.tsx` — animated SVG semicircular gauge.
- `ActivityFeed.tsx` — unified last-20 timeline pulling from deals/meetings/time stores.

## Alerts

`src/components/notifications/AlertsBell.tsx` — floating bell in `AppShell.tsx` header with badge count, popover listing derived alerts with quick-action buttons. Re-derives on store changes.

## Navigation

Add **"Time"** entry (Clock icon, violet) to `AppShell.tsx` sidebar. Mount AlertsBell in the shell header next to existing controls.

## Out of scope

- No backend tables — all state local (matches Meetings/Deals pattern).
- PDF export uses jsPDF text-only (no pixel-perfect branded template).
- "Anthropic" spec call mapped to Lovable AI Gateway (no key prompt).
- No cross-device sync.
