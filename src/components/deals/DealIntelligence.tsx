import { differenceInDays, format, startOfWeek } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Deal } from "@/lib/deals/types";

const STAGE_EXPECTED: Record<string, number> = {
  Prospecting: 14,
  Discovery: 21,
  Proposal: 14,
  Negotiation: 21,
};

export function DealIntelligence({ deal }: { deal: Deal }) {
  const today = new Date();
  const daysInStage = Math.max(0, differenceInDays(today, new Date(deal.createdAt)));
  const expected = STAGE_EXPECTED[deal.stage] ?? 21;

  // Last 8 weeks bucket
  const weeks: { week: string; count: number }[] = [];
  for (let w = 7; w >= 0; w--) {
    const ws = startOfWeek(new Date(today.getTime() - w * 7 * 86400000));
    weeks.push({ week: format(ws, "dd MMM"), count: 0 });
  }
  deal.interactions.forEach((i) => {
    const ws = startOfWeek(new Date(i.date));
    const label = format(ws, "dd MMM");
    const found = weeks.find((w) => w.week === label);
    if (found) found.count += 1;
  });

  const sentimentSeries = [...deal.interactions]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-10)
    .map((i, idx) => ({
      idx: idx + 1,
      sentiment: i.sentiment === "positive" ? 1 : i.sentiment === "neutral" ? 0.5 : 0,
      date: format(new Date(i.date), "dd MMM"),
    }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Stage Tenure</h3>
          <span className="font-mono text-xs text-muted-foreground">
            {daysInStage}d / {expected}d expected
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-blue-500"
            style={{ width: `${Math.min(100, (daysInStage / (expected * 2)) * 100)}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Total interactions: <span className="font-medium text-foreground">{deal.interactions.length}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
        <h3 className="mb-2 text-sm font-semibold">Interaction Frequency (last 8 weeks)</h3>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks}>
              <CartesianGrid stroke="#222" strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#888" }} />
              <YAxis tick={{ fontSize: 10, fill: "#888" }} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: "#0D1117", border: "1px solid #333" }} />
              <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur lg:col-span-2">
        <h3 className="mb-2 text-sm font-semibold">Sentiment Trend (last 10 interactions)</h3>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sentimentSeries}>
              <CartesianGrid stroke="#222" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: "#888" }} />
              <Tooltip contentStyle={{ backgroundColor: "#0D1117", border: "1px solid #333" }} />
              <Line type="monotone" dataKey="sentiment" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
