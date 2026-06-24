import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  periodDays: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(365)]).default(90),
});

export type MatrixCell = {
  oem_id: string;
  rep_id: string;
  leads: number;
  active: number;
  won: number;
  lost: number;
  pipeline_value: number;
  won_value: number;
};

export type OemRepMatrix = {
  oems: { id: string; name: string }[];
  reps: { id: string; name: string }[];
  cells: MatrixCell[];
  oem_totals: Record<string, { leads: number; pipeline_value: number; won_value: number; reps: number }>;
  rep_totals: Record<string, { leads: number; pipeline_value: number; won_value: number; oems: number }>;
};

export const getOemRepMatrix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<OemRepMatrix> => {
    const { supabase, userId } = context;
    const { data: cm } = await supabase
      .from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
    const companyId = cm?.company_id;
    if (!companyId) return { oems: [], reps: [], cells: [], oem_totals: {}, rep_totals: {} };

    const since = new Date(Date.now() - data.periodDays * 86400_000).toISOString();

    const [{ data: oems }, { data: leads }] = await Promise.all([
      supabase.from("crm_oems").select("id, name").eq("company_id", companyId).eq("is_active", true),
      supabase.from("crm_leads")
        .select("id, oem_id, assigned_to, stage, expected_value")
        .eq("company_id", companyId)
        .not("oem_id", "is", null)
        .not("assigned_to", "is", null)
        .gte("stage_changed_at", since),
    ]);

    if (!oems?.length || !leads?.length) {
      return { oems: oems ?? [], reps: [], cells: [], oem_totals: {}, rep_totals: {} };
    }

    const repIds = Array.from(new Set(leads.map((l) => l.assigned_to).filter(Boolean) as string[]));
    const { data: profiles } = repIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", repIds)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };

    const reps = (profiles ?? []).map((p) => ({
      id: p.id,
      name: p.full_name || p.email || "Unknown",
    })).sort((a, b) => a.name.localeCompare(b.name));

    const cellMap = new Map<string, MatrixCell>();
    for (const l of leads) {
      const key = `${l.oem_id}|${l.assigned_to}`;
      let c = cellMap.get(key);
      if (!c) {
        c = {
          oem_id: l.oem_id as string,
          rep_id: l.assigned_to as string,
          leads: 0, active: 0, won: 0, lost: 0,
          pipeline_value: 0, won_value: 0,
        };
        cellMap.set(key, c);
      }
      const val = Number(l.expected_value) || 0;
      c.leads += 1;
      if (l.stage === "won") { c.won += 1; c.won_value += val; }
      else if (l.stage === "lost") { c.lost += 1; }
      else { c.active += 1; c.pipeline_value += val; }
    }

    const cells = Array.from(cellMap.values());

    const oem_totals: OemRepMatrix["oem_totals"] = {};
    const rep_totals: OemRepMatrix["rep_totals"] = {};
    const oemReps = new Map<string, Set<string>>();
    const repOems = new Map<string, Set<string>>();

    for (const c of cells) {
      const o = oem_totals[c.oem_id] ??= { leads: 0, pipeline_value: 0, won_value: 0, reps: 0 };
      o.leads += c.leads; o.pipeline_value += c.pipeline_value; o.won_value += c.won_value;
      const r = rep_totals[c.rep_id] ??= { leads: 0, pipeline_value: 0, won_value: 0, oems: 0 };
      r.leads += c.leads; r.pipeline_value += c.pipeline_value; r.won_value += c.won_value;

      if (!oemReps.has(c.oem_id)) oemReps.set(c.oem_id, new Set());
      oemReps.get(c.oem_id)!.add(c.rep_id);
      if (!repOems.has(c.rep_id)) repOems.set(c.rep_id, new Set());
      repOems.get(c.rep_id)!.add(c.oem_id);
    }
    for (const [oid, set] of oemReps) oem_totals[oid].reps = set.size;
    for (const [rid, set] of repOems) rep_totals[rid].oems = set.size;

    return { oems: oems ?? [], reps, cells, oem_totals, rep_totals };
  });
