import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  periodDays: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(365)]).default(90),
  companyId: z.string().uuid().nullable().optional(),
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
    const { resolveCompanyScope } = await import("./company-scope.server");
    const companyId = await resolveCompanyScope(supabase as any, userId, data.companyId);
    if (!companyId) return { oems: [], reps: [], cells: [], oem_totals: {}, rep_totals: {} };

    const since = new Date(Date.now() - data.periodDays * 86400_000).toISOString();

    const [{ data: oemRows }, { data: leads }] = await Promise.all([
      supabase.from("crm_oems").select("id, name").eq("company_id", companyId),
      supabase.from("crm_leads")
        .select("id, oem_id, product_name, assigned_to, stage, expected_value, stage_changed_at, created_at")
        .eq("company_id", companyId)
        .not("assigned_to", "is", null)
        .or(`stage_changed_at.gte.${since},created_at.gte.${since}`),
    ]);

    if (!leads?.length) {
      return { oems: [], reps: [], cells: [], oem_totals: {}, rep_totals: {} };
    }

    // Build vendor dimension: OEM name (if oem_id) else product_name. Skip leads with neither.
    const oemNameById = new Map((oemRows ?? []).map((o) => [o.id, o.name]));
    const vendorMap = new Map<string, string>(); // key -> display name
    type Enriched = { vendorKey: string; rep: string; stage: string; value: number };
    const enriched: Enriched[] = [];
    for (const l of leads) {
      let key: string | null = null;
      let name: string | null = null;
      if (l.oem_id && oemNameById.has(l.oem_id)) {
        key = `oem:${l.oem_id}`;
        name = oemNameById.get(l.oem_id)!;
      } else if (l.product_name && l.product_name.trim()) {
        const trimmed = l.product_name.trim();
        key = `product:${trimmed.toLowerCase()}`;
        name = trimmed;
      }
      if (!key || !name || !l.assigned_to) continue;
      vendorMap.set(key, name);
      enriched.push({
        vendorKey: key, rep: l.assigned_to as string, stage: l.stage,
        value: Number(l.expected_value) || 0,
      });
    }

    if (enriched.length === 0) {
      return { oems: [], reps: [], cells: [], oem_totals: {}, rep_totals: {} };
    }

    const oems = Array.from(vendorMap, ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const repIds = Array.from(new Set(enriched.map((e) => e.rep)));
    const { data: profiles } = repIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", repIds)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };

    const reps = (profiles ?? []).map((p) => ({
      id: p.id,
      name: p.full_name || p.email || "Unknown",
    })).sort((a, b) => a.name.localeCompare(b.name));

    const cellMap = new Map<string, MatrixCell>();
    for (const e of enriched) {
      const key = `${e.vendorKey}|${e.rep}`;
      let c = cellMap.get(key);
      if (!c) {
        c = {
          oem_id: e.vendorKey, rep_id: e.rep,
          leads: 0, active: 0, won: 0, lost: 0,
          pipeline_value: 0, won_value: 0,
        };
        cellMap.set(key, c);
      }
      c.leads += 1;
      if (e.stage === "won") { c.won += 1; c.won_value += e.value; }
      else if (e.stage === "lost") { c.lost += 1; }
      else { c.active += 1; c.pipeline_value += e.value; }
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

    return { oems, reps, cells, oem_totals, rep_totals };
  });
