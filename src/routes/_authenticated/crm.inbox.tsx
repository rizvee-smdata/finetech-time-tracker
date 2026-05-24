import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { stageMeta, formatMoney } from "@/lib/crm/types";
import { format, formatDistanceToNow, isToday, isPast, parseISO, differenceInDays } from "date-fns";
import { Inbox, Calendar, AlertCircle, FileCheck, Clock, Phone, MessageCircle } from "lucide-react";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const { user, companyId, ready } = useAuth();

  const myLeads = useQuery({
    queryKey: ["crm-inbox-my-leads", companyId, user?.id],
    enabled: ready && !!companyId && !!user,
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_leads")
        .select("*")
        .eq("company_id", companyId)
        .eq("assigned_to", user!.id)
        .not("stage", "in", "(won,lost)")
        .order("last_activity_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const myReminders = useQuery({
    queryKey: ["crm-inbox-reminders", user?.id],
    enabled: ready && !!user,
    queryFn: async () => {
      const { data } = await sb
        .from("reminders")
        .select("*")
        .eq("user_id", user!.id)
        .is("read_at", null)
        .order("remind_at", { ascending: true })
        .limit(20);
      return data ?? [];
    },
  });

  const myApprovals = useQuery({
    queryKey: ["crm-inbox-approvals", companyId, user?.id],
    enabled: ready && !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("crm_quotes")
        .select("id, title, amount, currency, lead_id, approval_requested_at, crm_leads(customer_name)")
        .eq("company_id", companyId)
        .eq("approval_status", "requested")
        .order("approval_requested_at", { ascending: true });
      return (data ?? []) as any[];
    },
  });

  const leads = myLeads.data ?? [];
  const now = new Date();
  const overdueFollowups = leads.filter((l: any) => l.expected_close_date && isPast(parseISO(l.expected_close_date)));
  const dueToday = leads.filter((l: any) => l.expected_close_date && isToday(parseISO(l.expected_close_date)));
  const idle = leads.filter((l: any) => differenceInDays(now, parseISO(l.last_activity_at)) >= 5);
  const totalValue = leads.reduce((s: number, l: any) => s + (l.expected_value ?? 0), 0);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Inbox className="h-6 w-6" /> My day
        </h1>
        <p className="text-sm text-muted-foreground">Everything that needs your attention today.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">My active leads</div>
          <div className="text-2xl font-semibold">{leads.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Pipeline value</div>
          <div className="text-2xl font-semibold">{formatMoney(totalValue)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Overdue closes</div>
          <div className="text-2xl font-semibold text-red-600">{overdueFollowups.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Idle (5+ days)</div>
          <div className="text-2xl font-semibold text-amber-600">{idle.length}</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><AlertCircle className="h-4 w-4 text-red-600" /> Overdue close dates</h3>
          {overdueFollowups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing overdue. Great work.</p>
          ) : (
            <div className="divide-y">
              {overdueFollowups.slice(0, 8).map((l: any) => {
                const meta = stageMeta(l.stage);
                return (
                  <Link key={l.id} to="/crm/$leadId" params={{ leadId: l.id }} className="py-2 flex items-center gap-2 hover:bg-muted/40 -mx-2 px-2 rounded">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{l.customer_name}</div>
                      <div className="text-xs text-muted-foreground">Close was {format(parseISO(l.expected_close_date), "MMM d")}</div>
                    </div>
                    <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
                    <span className="text-sm">{formatMoney(l.expected_value, l.currency)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Calendar className="h-4 w-4" /> Closing today</h3>
          {dueToday.length === 0 ? (
            <p className="text-sm text-muted-foreground">No close dates today.</p>
          ) : (
            <div className="divide-y">
              {dueToday.map((l: any) => {
                const meta = stageMeta(l.stage);
                return (
                  <Link key={l.id} to="/crm/$leadId" params={{ leadId: l.id }} className="py-2 flex items-center gap-2 hover:bg-muted/40 -mx-2 px-2 rounded">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{l.customer_name}</div>
                      {l.company_name && <div className="text-xs text-muted-foreground truncate">{l.company_name}</div>}
                    </div>
                    <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
                    {l.phone && (
                      <>
                        <a href={`tel:${l.phone}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded hover:bg-muted"><Phone className="h-4 w-4" /></a>
                        <a href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="p-1.5 rounded hover:bg-muted text-green-600"><MessageCircle className="h-4 w-4" /></a>
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-amber-600" /> Idle leads (5+ days)</h3>
          {idle.length === 0 ? (
            <p className="text-sm text-muted-foreground">No idle leads.</p>
          ) : (
            <div className="divide-y">
              {idle.slice(0, 8).map((l: any) => {
                const days = differenceInDays(now, parseISO(l.last_activity_at));
                const meta = stageMeta(l.stage);
                return (
                  <Link key={l.id} to="/crm/$leadId" params={{ leadId: l.id }} className="py-2 flex items-center gap-2 hover:bg-muted/40 -mx-2 px-2 rounded">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{l.customer_name}</div>
                      <div className="text-xs text-muted-foreground">{days}d idle · {meta.label}</div>
                    </div>
                    <Badge variant={days >= 14 ? "destructive" : "secondary"}>{days}d</Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><FileCheck className="h-4 w-4" /> Pending approvals</h3>
          {(myApprovals.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No quotes awaiting approval.</p>
          ) : (
            <div className="divide-y">
              {(myApprovals.data ?? []).slice(0, 8).map((q: any) => (
                <Link key={q.id} to="/crm/$leadId" params={{ leadId: q.lead_id }} className="py-2 flex items-center gap-2 hover:bg-muted/40 -mx-2 px-2 rounded">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{q.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{q.crm_leads?.customer_name}</div>
                  </div>
                  <span className="text-sm">{formatMoney(q.amount, q.currency)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold mb-3">Reminders</h3>
        {(myReminders.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">All caught up.</p>
        ) : (
          <div className="divide-y">
            {(myReminders.data ?? []).map((r: any) => (
              <div key={r.id} className="py-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.title}</div>
                  {r.body && <div className="text-xs text-muted-foreground truncate">{r.body}</div>}
                </div>
                <span className="text-xs text-muted-foreground">{formatDistanceToNow(parseISO(r.remind_at), { addSuffix: true })}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
