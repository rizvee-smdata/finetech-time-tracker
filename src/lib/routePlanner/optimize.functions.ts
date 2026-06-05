import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CandidateSchema = z.object({
  client_id: z.string().min(1),
  client_name: z.string().min(1),
  area: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  priority: z.enum(["high", "medium", "low"]),
  visit_type: z.enum(["discovery", "follow_up", "demo"]),
  open_deal_value: z.number().nullable().optional(),
  days_since_last_visit: z.number().nullable().optional(),
});

const InputSchema = z.object({
  start_lat: z.number(),
  start_lng: z.number(),
  start_iso: z.string(), // start of day local time
  candidates: z.array(CandidateSchema).min(1).max(20),
});

const tool = {
  type: "function" as const,
  function: {
    name: "submit_optimized_route",
    description: "Return the optimal visit sequence for a Dhaka field sales rep.",
    parameters: {
      type: "object",
      properties: {
        sequence: {
          type: "array",
          items: {
            type: "object",
            properties: {
              client_id: { type: "string" },
              rationale: { type: "string", description: "Short reason this stop is in this position (e.g. 'Overdue follow-up + ৳4.5L open deal')" },
              travel_time_from_prev_min: { type: "number" },
              distance_from_prev_km: { type: "number" },
              estimated_arrival_offset_min: { type: "number", description: "Minutes after start time when the rep arrives" },
            },
            required: ["client_id", "rationale", "travel_time_from_prev_min", "distance_from_prev_km", "estimated_arrival_offset_min"],
            additionalProperties: false,
          },
        },
        estimated_total_km: { type: "number" },
        estimated_total_minutes: { type: "number" },
        traffic_warnings: { type: "array", items: { type: "string" } },
      },
      required: ["sequence", "estimated_total_km", "estimated_total_minutes", "traffic_warnings"],
      additionalProperties: false,
    },
  },
};

export const optimizeRoute = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("AI service is not configured.");

    const sys = `You are a route optimization AI for a field sales team in Dhaka, Bangladesh.
Given a list of clients with coordinates, priority, visit type, days since last visit, and open deal values, suggest the optimal visit sequence.

Scoring (combine these):
- Priority weight 40%: High=3, Medium=2, Low=1
- Deal urgency 30%: open_deal_value / max(days_since_last_visit, 1)
- Overdue penalty 30%: days_since_last_visit

Dhaka traffic constraints:
- Heavy congestion 8-10 AM and 5-7 PM in Motijheel, Paltan, Farmgate. Schedule those areas OUTSIDE these windows.
- Group visits by area (Mirpur, Uttara, Gulshan, Banani, Motijheel, Old Dhaka, Dhanmondi, Mohammadpur) to minimize cross-city travel.
- Start with clients in the direction opposite the office so the return trip naturally covers remaining ones.
- Average city speed: 15 km/h in commercial areas, 25 km/h elsewhere.
- Visit durations: discovery=60min, follow_up=30min, demo=90min.

Compute estimated_arrival_offset_min cumulatively (travel + previous visit durations).
Each rationale must reference WHY this stop is at this position (priority, overdue, deal size, traffic, geography).
Always call submit_optimized_route.`;

    const userMsg = {
      start: { lat: data.start_lat, lng: data.start_lng, start_time: data.start_iso },
      clients: data.candidates,
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: JSON.stringify(userMsg) },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "submit_optimized_route" } },
      }),
    });

    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI usage limit reached. Add credits in Settings.");
    if (!res.ok) {
      const t = await res.text();
      console.error("route optimize error", res.status, t);
      throw new Error(`AI service error (${res.status}).`);
    }

    const payload = await res.json();
    const argsStr = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) throw new Error("AI did not return structured output.");
    const parsed = JSON.parse(argsStr) as {
      sequence: Array<{
        client_id: string;
        rationale: string;
        travel_time_from_prev_min: number;
        distance_from_prev_km: number;
        estimated_arrival_offset_min: number;
      }>;
      estimated_total_km: number;
      estimated_total_minutes: number;
      traffic_warnings: string[];
    };
    return { ...parsed, model: "google/gemini-2.5-flash" };
  });
