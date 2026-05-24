import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays,
  addMonths, subMonths, isSameMonth, isSameDay, parseISO, isWithinInterval,
} from "date-fns";
import { ChevronLeft, ChevronRight, Bell, Calendar as CalIcon, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/calendar")({
  component: CalendarPage,
});

type Reminder = {
  id: string;
  title: string;
  body: string | null;
  remind_at: string;
  visit_id: string | null;
  user_id: string;
};

type LeadEvent = {
  id: string;
  customer_name: string;
  company_name: string | null;
  expected_close_date: string | null;
  renewal_date: string | null;
  stage: string;
  is_renewal: boolean;
};

function CalendarPage() {
  const { companyId, user } = useAuth();
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState<Date>(new Date());

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const reminders = useQuery({
    queryKey: ["calendar-reminders", user?.id, format(monthStart, "yyyy-MM")],
    enabled: !!user?.id,
    queryFn: async (): Promise<Reminder[]> => {
      const { data, error } = await sb
        .from("reminders")
        .select("*")
        .eq("user_id", user!.id)
        .gte("remind_at", gridStart.toISOString())
        .lte("remind_at", gridEnd.toISOString())
        .order("remind_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Reminder[];
    },
  });

  const leadEvents = useQuery({
    queryKey: ["calendar-leads", companyId, format(monthStart, "yyyy-MM")],
    enabled: !!companyId,
    queryFn: async (): Promise<LeadEvent[]> => {
      const dStart = format(gridStart, "yyyy-MM-dd");
      const dEnd = format(gridEnd, "yyyy-MM-dd");
      const { data, error } = await sb
        .from("crm_leads")
        .select("id, customer_name, company_name, expected_close_date, renewal_date, stage, is_renewal")
        .eq("company_id", companyId)
        .or(`and(expected_close_date.gte.${dStart},expected_close_date.lte.${dEnd}),and(renewal_date.gte.${dStart},renewal_date.lte.${dEnd})`);
      if (error) throw error;
      return (data ?? []) as LeadEvent[];
    },
  });

  const days = useMemo(() => {
    const arr: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      arr.push(d);
      d = addDays(d, 1);
    }
    return arr;
  }, [gridStart, gridEnd]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, { reminders: Reminder[]; closes: LeadEvent[]; renewals: LeadEvent[] }>();
    const key = (d: Date) => format(d, "yyyy-MM-dd");
    for (const d of days) map.set(key(d), { reminders: [], closes: [], renewals: [] });
    for (const r of reminders.data ?? []) {
      const k = format(parseISO(r.remind_at), "yyyy-MM-dd");
      map.get(k)?.reminders.push(r);
    }
    for (const l of leadEvents.data ?? []) {
      if (l.expected_close_date && map.has(l.expected_close_date)) {
        map.get(l.expected_close_date)!.closes.push(l);
      }
      if (l.renewal_date && map.has(l.renewal_date)) {
        map.get(l.renewal_date)!.renewals.push(l);
      }
    }
    return map;
  }, [days, reminders.data, leadEvents.data]);

  const selectedKey = format(selected, "yyyy-MM-dd");
  const selectedEvents = eventsByDay.get(selectedKey) ?? { reminders: [], closes: [], renewals: [] };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="text-sm text-muted-foreground">Reminders, closing dates, and renewals at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(subMonths(cursor, 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-36 text-center text-sm font-medium">{format(cursor, "MMMM yyyy")}</div>
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setCursor(new Date()); setSelected(new Date()); }}>
            Today
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const k = format(d, "yyyy-MM-dd");
              const ev = eventsByDay.get(k)!;
              const inMonth = isSameMonth(d, monthStart);
              const isToday = isSameDay(d, new Date());
              const isSel = isSameDay(d, selected);
              const total = ev.reminders.length + ev.closes.length + ev.renewals.length;
              return (
                <button
                  key={k}
                  onClick={() => setSelected(d)}
                  className={cn(
                    "min-h-20 border-b border-r p-1.5 text-left transition-colors hover:bg-muted/50",
                    !inMonth && "bg-muted/20 text-muted-foreground",
                    isSel && "bg-primary/5 ring-2 ring-inset ring-primary",
                  )}
                >
                  <div className={cn(
                    "mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs",
                    isToday && "bg-primary text-primary-foreground font-semibold",
                  )}>
                    {format(d, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {ev.reminders.slice(0, 2).map((r) => (
                      <div key={r.id} className="truncate rounded bg-amber-500/15 px-1 text-[10px] text-amber-700">
                        🔔 {r.title}
                      </div>
                    ))}
                    {ev.closes.slice(0, 2).map((l) => (
                      <div key={"c" + l.id} className="truncate rounded bg-blue-500/15 px-1 text-[10px] text-blue-700">
                        ▸ {l.customer_name}
                      </div>
                    ))}
                    {ev.renewals.slice(0, 1).map((l) => (
                      <div key={"r" + l.id} className="truncate rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-700">
                        ↻ {l.customer_name}
                      </div>
                    ))}
                    {total > 5 && (
                      <div className="text-[10px] text-muted-foreground">+{total - 5} more</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 border-b pb-3">
            <CalIcon className="size-4 text-muted-foreground" />
            <div>
              <div className="font-semibold">{format(selected, "EEEE")}</div>
              <div className="text-xs text-muted-foreground">{format(selected, "MMMM d, yyyy")}</div>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {selectedEvents.reminders.length === 0 && selectedEvents.closes.length === 0 && selectedEvents.renewals.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">No events on this day.</div>
            )}

            {selectedEvents.reminders.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Bell className="size-3" /> Reminders
                </div>
                <div className="space-y-1.5">
                  {selectedEvents.reminders.map((r) => (
                    <div key={r.id} className="rounded border bg-amber-500/5 p-2 text-sm">
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground">{format(parseISO(r.remind_at), "h:mm a")}</div>
                      {r.body && <div className="mt-1 text-xs text-muted-foreground">{r.body}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedEvents.closes.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Closing today</div>
                <div className="space-y-1.5">
                  {selectedEvents.closes.map((l) => (
                    <Link
                      key={l.id}
                      to="/crm/$leadId"
                      params={{ leadId: l.id }}
                      className="flex items-center justify-between rounded border bg-blue-500/5 p-2 text-sm hover:bg-blue-500/10"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{l.customer_name}</div>
                        {l.company_name && <div className="truncate text-xs text-muted-foreground">{l.company_name}</div>}
                      </div>
                      <Badge variant="outline" className="ml-2 capitalize">{l.stage}</Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {selectedEvents.renewals.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Renewals</div>
                <div className="space-y-1.5">
                  {selectedEvents.renewals.map((l) => (
                    <Link
                      key={l.id}
                      to="/crm/$leadId"
                      params={{ leadId: l.id }}
                      className="flex items-center justify-between rounded border bg-emerald-500/5 p-2 text-sm hover:bg-emerald-500/10"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{l.customer_name}</div>
                        {l.company_name && <div className="truncate text-xs text-muted-foreground">{l.company_name}</div>}
                      </div>
                      <ArrowRight className="ml-2 size-4 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
