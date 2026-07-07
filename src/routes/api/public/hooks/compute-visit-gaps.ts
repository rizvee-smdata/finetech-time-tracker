import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Daily cron: recomputes gap scores for all companies, sends in-app reminders
// for critical/high accounts, and escalates accounts that stayed critical >7d
// to managers/admins.
export const Route = createFileRoute("/api/public/hooks/compute-visit-gaps")({
  server: {
    handlers: {
      POST: async () => {
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );

        const { data: companies, error: cErr } = await supabase.from("companies").select("id, name");
        if (cErr) return json({ ok: false, error: cErr.message }, 500);

        let totalScored = 0;
        let remindersInserted = 0;
        const escalations: string[] = [];

        for (const c of companies ?? []) {
          const { data: count } = await supabase.rpc("compute_visit_gaps", { _company: c.id });
          totalScored += Number(count ?? 0);

          // Load active snoozes
          const { data: snoozes } = await supabase
            .from("visit_snoozes")
            .select("customer_id, user_id, snoozed_until")
            .eq("company_id", c.id)
            .gt("snoozed_until", new Date().toISOString());
          const snoozedByRep = new Map<string, Set<string>>();
          (snoozes ?? []).forEach((s: any) => {
            const set = snoozedByRep.get(s.user_id) ?? new Set();
            set.add(s.customer_id);
            snoozedByRep.set(s.user_id, set);
          });

          // Critical + high per rep
          const { data: gaps } = await supabase
            .from("visit_gap_scores")
            .select("customer_id, assigned_rep_id, priority, days_since_last_visit, gap_score, computed_at")
            .eq("company_id", c.id)
            .in("priority", ["critical", "high"])
            .not("assigned_rep_id", "is", null);

          const byRep = new Map<string, any[]>();
          (gaps ?? []).forEach((g: any) => {
            if (snoozedByRep.get(g.assigned_rep_id)?.has(g.customer_id)) return;
            const arr = byRep.get(g.assigned_rep_id) ?? [];
            arr.push(g);
            byRep.set(g.assigned_rep_id, arr);
          });

          // Load customer names
          const custIds = Array.from(new Set((gaps ?? []).map((g: any) => g.customer_id)));
          const { data: custs } = custIds.length
            ? await supabase.from("customers").select("id, customer_name").in("id", custIds)
            : { data: [] as any[] };
          const nameMap = new Map((custs ?? []).map((x: any) => [x.id, x.customer_name]));

          for (const [repId, list] of byRep) {
            const sorted = list.sort((a, b) => Number(b.gap_score) - Number(a.gap_score)).slice(0, 10);
            const criticalCount = sorted.filter((g) => g.priority === "critical").length;
            const top = sorted
              .slice(0, 5)
              .map((g) => `${nameMap.get(g.customer_id) ?? "Account"} (${g.days_since_last_visit ?? "?"}d)`)
              .join(", ");

            // Dedup: skip if we already inserted a "visit-gap" reminder for this rep in past 20h
            const { data: existing } = await supabase
              .from("reminders")
              .select("id")
              .eq("user_id", repId)
              .eq("category", "visit-gap")
              .gte("created_at", new Date(Date.now() - 20 * 3600 * 1000).toISOString())
              .limit(1);
            if (existing && existing.length) continue;

            await supabase.from("reminders").insert({
              user_id: repId,
              company_id: c.id,
              category: "visit-gap",
              title: `${sorted.length} account${sorted.length > 1 ? "s" : ""} overdue for a visit`,
              body: `${criticalCount} critical. Top: ${top}`,
              remind_at: new Date().toISOString(),
              link_url: "/visits/due",
              metadata: { count: sorted.length, critical: criticalCount },
            });
            remindersInserted++;
          }

          // Escalation: critical + no visit >= 7 days after they became critical.
          // Approximation: use days_since_last_visit >= expected + 7 and priority=critical.
          const { data: escList } = await supabase
            .from("visit_gap_scores")
            .select("customer_id, assigned_rep_id, days_since_last_visit, expected_interval_days")
            .eq("company_id", c.id)
            .eq("priority", "critical");
          const toEscalate = (escList ?? []).filter(
            (g: any) => (g.days_since_last_visit ?? 0) >= (g.expected_interval_days ?? 0) + 7,
          );
          if (toEscalate.length) {
            // find managers/admins for the company
            const { data: members } = await supabase
              .from("company_members")
              .select("user_id")
              .eq("company_id", c.id);
            const memberIds = (members ?? []).map((m: any) => m.user_id);
            const { data: roles } = memberIds.length
              ? await supabase.from("user_roles").select("user_id, role").in("user_id", memberIds)
              : { data: [] as any[] };
            const managerIds = (roles ?? [])
              .filter((r: any) => r.role === "admin" || r.role === "manager")
              .map((r: any) => r.user_id);

            for (const managerId of managerIds) {
              const { data: exists } = await supabase
                .from("reminders")
                .select("id")
                .eq("user_id", managerId)
                .eq("category", "visit-gap-escalation")
                .gte("created_at", new Date(Date.now() - 20 * 3600 * 1000).toISOString())
                .limit(1);
              if (exists && exists.length) continue;
              await supabase.from("reminders").insert({
                user_id: managerId,
                company_id: c.id,
                category: "visit-gap-escalation",
                title: `${toEscalate.length} account${toEscalate.length > 1 ? "s" : ""} critical >7 days`,
                body: `Please review — accounts have been critical without a visit for more than a week.`,
                remind_at: new Date().toISOString(),
                link_url: "/visits/due",
                metadata: { count: toEscalate.length },
              });
              escalations.push(managerId);
            }
          }
        }

        return json({ ok: true, scored: totalScored, reminders: remindersInserted, escalations: escalations.length });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
