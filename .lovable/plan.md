# Deal Health Score + Next Best Action

Build a new "Deals" module in DeskIQ with local health-score calculation and AI-powered Next Best Actions, mirroring the Meetings module's architecture (localStorage store + Lovable AI Gateway via `createServerFn`).

## AI provider note
The spec calls `api.anthropic.com` directly with a hardcoded key — that would leak the key in client code. I'll route the AI call through a TanStack `createServerFn` to the **Lovable AI Gateway** using `google/gemini-3-flash-preview` with structured tool-calling (no API key needed, consistent with the Meetings module). All prompt fields, response shape, and downstream UI match the spec exactly.

Currency: previous turn switched the app to USD. I'll keep the `Deal.currency` type as `'BDT' | 'USD'` per spec but seed deals with `USD` and format via the existing `en-US` formatter. (If you want seeds in BDT, say the word.)

## Files

**Types & logic**
- `src/lib/deals/types.ts` — `Deal`, `DealStage`, `Interaction`, `DealHealth`, `ScoreBreakdown`, `NextBestAction`, `AIDealAnalysis`
- `src/lib/deals/scoring.ts` — `calculateHealthScore(deal)` exactly per spec
- `src/lib/deals/storage.ts` — `useDealsStore` hook (localStorage `deskiq_deals`, pub/sub, CRUD, `addInteraction` auto-recalculates score, `toggleAction`, seed loader)
- `src/lib/deals/seed.ts` — 5 seed deals with 4–6 interactions each
- `src/lib/deals/analyze.functions.ts` — `analyzeDeal` serverFn (Lovable AI Gateway + tool calling → `AIDealAnalysis`)
- `src/lib/deals/winloss.functions.ts` — `generateWinLossReport` serverFn

**Routes** (`src/routes/_authenticated/`)
- `deals.tsx` — tab layout (Pipeline / Action Center / Win-Loss)
- `deals.index.tsx` — Pipeline Overview (summary bar + kanban)
- `deals.$dealId.tsx` — Deal Detail (4 tabs: AI Analysis, Next Best Actions, Timeline, Intelligence)
- `deals.actions.tsx` — Action Center
- `deals.insights.tsx` — Win/Loss Insights

**Components** (`src/components/deals/`)
- `HealthGauge.tsx` — animated circular SVG gauge (sizes: sm/md/lg), traffic-light colors
- `DealCard.tsx` — kanban card with gauge, badges, trend, top NBA preview
- `PipelineBoard.tsx` — 6-column kanban
- `PipelineSummary.tsx` — 4 metric cards
- `PipelineFilters.tsx` — search/filter/sort + Recalculate All
- `StageStepper.tsx` — horizontal stage progress
- `ScoreBreakdownChart.tsx` — horizontal bars for 4 components
- `AIAnalysisPanel.tsx` — diagnosis + win prob + risks + signals + competitor strategy + coaching tip
- `NextBestActionCard.tsx` — priority/urgency/impact badges, expandable draft with copy/edit, mark complete
- `InteractionTimeline.tsx` + `AddInteractionForm.tsx`
- `DealIntelligence.tsx` — Recharts (interaction freq bar, sentiment trend line, stage benchmark)
- `ActionCenterList.tsx` — grouped by urgency with Done/Snooze
- `WinLossInsights.tsx` — 4 metric cards + Recharts + AI report button

**Navigation**
- Add "Deals" to `src/components/AppShell.tsx` sidebar

## Health scoring
Implemented verbatim from spec (recency/engagement/momentum/sentiment, each max 25). Status thresholds: ≥70 healthy, ≥40 at_risk, else stalling. Trend computed by comparing to previous stored score.

## AI serverFn shape
`analyzeDeal({ dealId })` → tool-call `return_deal_analysis` returns `{ dealDiagnosis, winProbability, estimatedCloseDate, riskFactors[], positiveSignals[], nextBestActions[], competitorStrategy, dealCoachingTip }`. Maps `nextBestActions` into `NextBestAction[]` with generated IDs + `completed: false`. Handles 429/402 with toasts.

## Acceptance criteria coverage
All 10 acceptance items covered. Out of scope: the 4 follow-up prompts (daily briefing, email tracking sim, deal comparison, Meeting Intelligence cross-link).
