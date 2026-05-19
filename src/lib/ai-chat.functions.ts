import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

const SYSTEM = `You are an analytics assistant for "Lavisho Tracker", a field-sales CRM.
You answer questions about employees, customers, partners, consultants and customer visits.

Use the provided tools to query live data. NEVER invent numbers — always call a tool.
Be concise. When listing rankings, use a short markdown table or bullet list.
Dates are ISO. "Last X days" means meeting_at >= now - X days.

If a user mentions an employee/customer/company by name, pass it as a "like" substring filter.
After getting tool results, summarize them in plain English.`;

export const aiChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messages: ChatMsg[] }) => {
    if (!Array.isArray(input?.messages)) throw new Error("messages required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");

    // Helper: resolve employee filter -> array of user_ids
    async function resolveEmployeeIds(nameOrEmail?: string | null): Promise<string[] | null> {
      if (!nameOrEmail) return null;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .or(`full_name.ilike.%${nameOrEmail}%,email.ilike.%${nameOrEmail}%`);
      return (profs ?? []).map((p) => p.id);
    }

    const tools = {
      list_employees: tool({
        description: "List employees (profiles) optionally filtered by name/email substring.",
        inputSchema: z.object({
          search: z.string().optional().describe("Name or email substring filter"),
          limit: z.number().int().min(1).max(200).optional(),
        }),
        execute: async ({ search, limit = 50 }) => {
          let q = supabase.from("profiles").select("id, full_name, email").limit(limit);
          if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
          const { data, error } = await q;
          if (error) return { error: error.message };
          return { employees: data };
        },
      }),

      query_visits: tool({
        description:
          "Query customer_visits. Filter by employee name/email, customer name, company name, status, and date range (days back from now). Returns up to 'limit' visits.",
        inputSchema: z.object({
          employee: z.string().optional().describe("Employee name or email substring"),
          customer: z.string().optional().describe("Customer name substring"),
          company: z.string().optional().describe("Company name substring"),
          status: z.string().optional(),
          days: z.number().int().min(1).max(3650).optional().describe("Last N days based on meeting_at"),
          limit: z.number().int().min(1).max(200).optional(),
        }),
        execute: async ({ employee, customer, company, status, days, limit = 50 }) => {
          const employeeIds = await resolveEmployeeIds(employee);
          if (employee && (employeeIds?.length ?? 0) === 0) {
            return { count: 0, visits: [], note: `No employee matched "${employee}"` };
          }
          let q = supabase
            .from("customer_visits")
            .select(
              "id, customer_name, company, contact_type, status, meeting_at, next_meeting_at, next_action, location, user_id, discussion_summary",
            )
            .order("meeting_at", { ascending: false })
            .limit(limit);
          if (employeeIds) q = q.in("user_id", employeeIds);
          if (customer) q = q.ilike("customer_name", `%${customer}%`);
          if (company) q = q.ilike("company", `%${company}%`);
          if (status) q = q.eq("status", status);
          if (days) {
            const since = new Date(Date.now() - days * 86400000).toISOString();
            q = q.gte("meeting_at", since);
          }
          const { data, error } = await q;
          if (error) return { error: error.message };

          // attach employee names
          const ids = Array.from(new Set((data ?? []).map((v) => v.user_id)));
          const { data: profs } = ids.length
            ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
            : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
          const pm = new Map((profs ?? []).map((p) => [p.id, p]));
          return {
            count: data?.length ?? 0,
            visits: (data ?? []).map((v) => ({
              ...v,
              employee: pm.get(v.user_id)?.full_name ?? pm.get(v.user_id)?.email ?? v.user_id,
            })),
          };
        },
      }),

      rank_visits: tool({
        description:
          "Rank entities by number of visits within a date range. groupBy: 'employee' | 'customer' | 'company'. order: 'desc' (top) or 'asc' (least).",
        inputSchema: z.object({
          groupBy: z.enum(["employee", "customer", "company"]),
          days: z.number().int().min(1).max(3650).optional(),
          order: z.enum(["desc", "asc"]).optional(),
          limit: z.number().int().min(1).max(50).optional(),
        }),
        execute: async ({ groupBy, days, order = "desc", limit = 10 }) => {
          let q = supabase
            .from("customer_visits")
            .select("user_id, customer_name, company, meeting_at")
            .limit(5000);
          if (days) {
            const since = new Date(Date.now() - days * 86400000).toISOString();
            q = q.gte("meeting_at", since);
          }
          const { data, error } = await q;
          if (error) return { error: error.message };

          const counts = new Map<string, number>();
          for (const row of data ?? []) {
            let key: string | null = null;
            if (groupBy === "employee") key = row.user_id;
            else if (groupBy === "customer") key = row.customer_name;
            else key = row.company ?? "(no company)";
            if (!key) continue;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
          let entries = Array.from(counts.entries()).map(([key, count]) => ({ key, count }));

          // If ranking by employee, include all employees (even with 0 visits) for "least active"
          if (groupBy === "employee" && order === "asc") {
            const { data: allProfs } = await supabase.from("profiles").select("id");
            const seen = new Set(entries.map((e) => e.key));
            for (const p of allProfs ?? []) {
              if (!seen.has(p.id)) entries.push({ key: p.id, count: 0 });
            }
          }

          entries.sort((a, b) => (order === "desc" ? b.count - a.count : a.count - b.count));
          entries = entries.slice(0, limit);

          // Resolve employee names
          if (groupBy === "employee") {
            const { data: profs } = await supabase
              .from("profiles")
              .select("id, full_name, email")
              .in("id", entries.map((e) => e.key));
            const pm = new Map((profs ?? []).map((p) => [p.id, p]));
            return {
              groupBy,
              order,
              results: entries.map((e) => ({
                name: pm.get(e.key)?.full_name ?? pm.get(e.key)?.email ?? e.key,
                visits: e.count,
              })),
            };
          }
          return {
            groupBy,
            order,
            results: entries.map((e) => ({ name: e.key, visits: e.count })),
          };
        },
      }),

      rank_contacts: tool({
        description:
          "Rank partners or consultants by number of related visits (matched by customer_name substring). type: 'partner' | 'consultant'.",
        inputSchema: z.object({
          type: z.enum(["partner", "consultant"]),
          days: z.number().int().min(1).max(3650).optional(),
          limit: z.number().int().min(1).max(50).optional(),
        }),
        execute: async ({ type, days, limit = 10 }) => {
          const { data: contacts, error: cErr } = await supabase
            .from("customers")
            .select("id, customer_name")
            .eq("kind", type);
          if (cErr) return { error: cErr.message };

          let q = supabase.from("customer_visits").select("company, customer_name, meeting_at").limit(5000);
          if (days) {
            const since = new Date(Date.now() - days * 86400000).toISOString();
            q = q.gte("meeting_at", since);
          }
          const { data: visits, error: vErr } = await q;
          if (vErr) return { error: vErr.message };

          const results = (contacts ?? []).map((c) => {
            const target = (c.customer_name ?? "").toLowerCase();
            const count = target
              ? (visits ?? []).filter(
                  (v) =>
                    (v.company ?? "").toLowerCase().includes(target) ||
                    (v.customer_name ?? "").toLowerCase().includes(target),
                ).length
              : 0;
            return { name: c.customer_name, visits: count };
          });
          results.sort((a, b) => b.visits - a.visits);
          return { type, results: results.slice(0, limit) };
        },
      }),


      summary_stats: tool({
        description: "Overall summary counts: total visits, employees, customers, partners, consultants.",
        inputSchema: z.object({
          days: z.number().int().min(1).max(3650).optional(),
        }),
        execute: async ({ days }) => {
          const since = days ? new Date(Date.now() - days * 86400000).toISOString() : null;
          let vq = supabase.from("customer_visits").select("id", { count: "exact", head: true });
          if (since) vq = vq.gte("meeting_at", since);
          const [v, e, cust, partners, consultants] = await Promise.all([
            vq,
            supabase.from("profiles").select("id", { count: "exact", head: true }),
            supabase.from("customers").select("id", { count: "exact", head: true }).eq("kind", "customer"),
            supabase.from("customers").select("id", { count: "exact", head: true }).eq("kind", "partner"),
            supabase.from("customers").select("id", { count: "exact", head: true }).eq("kind", "consultant"),
          ]);
          return {
            window_days: days ?? "all-time",
            visits: v.count ?? 0,
            employees: e.count ?? 0,
            customers: cust.count ?? 0,
            partners: partners.count ?? 0,
            consultants: consultants.count ?? 0,
          };

        },
      }),
    };

    const modelMessages: ModelMessage[] = data.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })) as ModelMessage[];

    const result = await generateText({
      model,
      system: SYSTEM,
      tools,
      stopWhen: stepCountIs(50),
      messages: modelMessages,
    });

    return { text: result.text };
  });
