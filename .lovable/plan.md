# DeskIQ Intelligence Layer

Depth 3 = focused, high-impact AI everywhere — not a token feature in every form. One global agent + the highest-leverage inline assists per module.

## 1. Global AI Agent Sidebar (`/_authenticated`)

A right-side slide-over (CMD+J), context-aware of the current route.

- **Component**: `src/components/global/AIAgent.tsx` (sheet, chat UI, streaming).
- **Server fn**: `src/lib/ai/agent.functions.ts` — `runAgent({ messages, route, context })` using Lovable AI Gateway, `google/gemini-3-flash-preview`, tool-calling enabled.
- **Tool surface** (executed server-side then applied client-side via a single `applyAction` reducer):
  - `search_data` — read deals / leads / meetings / tasks / proposals
  - `update_deal_stage`, `add_deal_interaction`, `create_next_best_action`
  - `create_task`, `complete_task`
  - `draft_email`, `draft_proposal_section`
  - `start_timer`, `stop_timer`
  - `summarize_meeting`, `link_meeting_to_deal`
- **Auto-apply**: every tool call returns `{ applied: true, undo: <snapshot> }` and shows an inline "Undo" chip in the chat for 30s. No confirmation modal — user asked for full agent.
- **Safety rails**: hard-disallow destructive ops (delete deal, delete user, mass updates >5 rows) — agent returns "needs confirmation" instead.
- **Page context**: each route registers `useAIContext({ summary, entities })` so the agent prompt always carries "you are on /deals/abc — deal: Jamuna Bank, stage Negotiation".

## 2. Inline AI assists (the high-leverage ones)

| Module | Surface | Action |
|---|---|---|
| CRM Lead form | "✨ Score & enrich" button | AI scores 0-100 + tags industry/tier/reasoning |
| CRM Lead detail | "Draft outreach" | Personalized first-touch email (BD market tone) |
| CRM Lead row | Inline "Next step" chip | One-sentence next action (regenerable) |
| Deals detail | "Coach me" panel | 3-bullet coaching: risks, what to say, when |
| Deals pipeline | "Weekly digest" button (top) | Markdown digest of stalled / hot / closing-this-week |
| Tasks board | "Plan my day" (top of board) | Generates an ordered list with reasoning, one-click apply as task order |
| Planning new | "Suggest plan" | Drafts plan items from open deals + recent meetings |
| Visits new | "Summarize notes" on textarea | Cleans up raw notes → structured summary + tags |
| Meetings ResultsView | (already has AI) — add "Generate follow-up tasks" | Creates tasks from action items in one click |
| Reports index | "Explain this week" card | Narrative summary of pipeline + time + wins |

Each assist = one shared `<AIButton>` component + a thin server fn per use-case under `src/lib/ai/assists/`.

## 3. Shared infrastructure

- `src/lib/ai/gateway.ts` — already exists (`ai-gateway.ts`). Reused.
- `src/lib/ai/agent.functions.ts` — new, the agent loop with tool dispatch.
- `src/lib/ai/tools.ts` — tool schemas (zod) + server-side executors that read/write the existing localStorage stores via the existing `integrations.ts` helpers.
- `src/lib/ai/context.tsx` — `<AIContextProvider>` + `useAIContext()` hook; mounted once in `_authenticated/route.tsx`.
- `src/components/global/AIAgent.tsx` — the sheet, chat list (react-markdown), streaming, undo chips. Keyboard: CMD+J / CTRL+J.
- `src/components/ai/AIButton.tsx` — small reusable button with spinner + result drawer.
- `AppShell.tsx` — add a Sparkles trigger next to GlobalSearch on desktop and mobile.

## 4. Architecture notes (technical)

```text
User → AIAgent sheet → runAgent serverFn
                          ↓ (tool call loop)
                       Gemini decides → returns tool call
                          ↓
                       executor (server) returns data OR plan
                          ↓
                       sheet applies via window events
                       (deskiq:deals-updated, deskiq:time-updated, etc.)
                          ↓
                       all existing stores auto-rehydrate
```

- All state lives in localStorage today; agent reads/writes through the same `useDealsStore`/`useTimeStore`/`useProposalsStore` event channels that already exist — no schema changes, no migrations.
- Streaming response via SSE through existing `ai-gateway.ts` pattern (already used by `briefing.functions.ts`).
- One model: `google/gemini-3-flash-preview` for assists, `google/gemini-2.5-pro` only for the agent loop (better tool-calling).

## 5. Out of scope for this pass (call out)

- Vector search / RAG over past meetings — would need pgvector, ask later.
- Voice input for the agent — easy follow-up.
- AI in Attendance, Expenses, Contracts, Surveys, Targets, Reminders — lower leverage, will add if you want a second pass.
- Confirmation modals on destructive ops are *off* per your "full agent" pick; if you change your mind, flip one flag.

## 6. Build order (single pass)

1. `lib/ai/context.tsx` + `_authenticated/route.tsx` wiring
2. `lib/ai/tools.ts` (schemas + executors)
3. `lib/ai/agent.functions.ts` (agent loop)
4. `components/global/AIAgent.tsx` + `AppShell` trigger + CMD+J
5. `components/ai/AIButton.tsx` + 10 inline assists (one server fn each, ~15 LOC each)
6. Smoke-check build, fix types

Estimated ~15 files added, ~6 files touched.

---

Approve and I'll build it. Reply with any tweaks (e.g. "skip Reports", "use Gemini Pro for assists too", "require confirmation on destructive tools").
