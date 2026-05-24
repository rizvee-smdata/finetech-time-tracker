import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchCompanyMembers } from "@/lib/crm/queries";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { Activity, Phone, Mail, MessageSquare, Calendar, StickyNote, Tag, ArrowRight } from "lucide-react";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/activity")({
  component: ActivityFeedPage,
});

type Act = {
  id: string;
  lead_id: string;
  user_id: string | null;
  activity_type: string;
  title: string | null;
  body: string | null;
  occurred_at: string;
  metadata: any;
  lead?: { customer_name: string; company_name: string | null } | null;
  user?: { full_name: string | null; email: string | null } | null;
};

const ICONS: Record<string, any> = {
  call: Phone,
  email: Mail,
  whatsapp: MessageSquare,
  sms: MessageSquare,
  meeting: Calendar,
  note: StickyNote,
  stage_change: ArrowRight,
  assignment: Tag,
};

function ActivityFeedPage() {
  const { companyId } = useAuth();
  const [type, setType] = useState<string>("all");
  const [userId, setUserId] = useState<string>("all");
  const [search, setSearch] = useState("");

  const members = useQuery({
    queryKey: ["company-members", companyId],
    enabled: !!companyId,
    queryFn: () => fetchCompanyMembers(companyId!),
  });

  const activity = useQuery({
    queryKey: ["crm-activity-feed", companyId, type, userId],
    enabled: !!companyId,
    queryFn: async (): Promise<Act[]> => {
      const { data: leads, error: le } = await sb
        .from("crm_leads")
        .select("id, customer_name, company_name")
        .eq("company_id", companyId);
      if (le) throw le;
      const leadIds = (leads ?? []).map((l: any) => l.id);
      if (leadIds.length === 0) return [];
      let q = sb
        .from("crm_lead_activities")
        .select("*")
        .in("lead_id", leadIds)
        .order("occurred_at", { ascending: false })
        .limit(300);
      if (type !== "all") q = q.eq("activity_type", type);
      if (userId !== "all") q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Act[];
      const leadMap = new Map<string, any>((leads ?? []).map((l: any) => [l.id, l]));
      const uids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
      let userMap = new Map<string, any>();
      if (uids.length) {
        const { data: profs } = await sb.from("profiles").select("id, full_name, email").in("id", uids);
        userMap = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
      }
      for (const r of rows) {
        r.lead = (leadMap.get(r.lead_id) as any) ?? null;
        r.user = r.user_id ? ((userMap.get(r.user_id) as any) ?? null) : null;
      }
      return rows;
    },
  });

  const filtered = useMemo(() => {
    const list = activity.data ?? [];
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter((a) => {
      const blob = `${a.title ?? ""} ${a.body ?? ""} ${a.lead?.customer_name ?? ""} ${a.lead?.company_name ?? ""}`.toLowerCase();
      return blob.includes(s);
    });
  }, [activity.data, search]);

  const grouped = useMemo(() => {
    const m = new Map<string, Act[]>();
    for (const a of filtered) {
      const k = format(parseISO(a.occurred_at), "EEEE, MMM d");
      const arr = m.get(k) ?? [];
      arr.push(a);
      m.set(k, arr);
    }
    return Array.from(m.entries());
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Activity feed</h1>
        <p className="text-sm text-muted-foreground">Every touch across every lead in your company.</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All activities</SelectItem>
              <SelectItem value="call">Calls</SelectItem>
              <SelectItem value="email">Emails</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="meeting">Meetings</SelectItem>
              <SelectItem value="note">Notes</SelectItem>
              <SelectItem value="stage_change">Stage changes</SelectItem>
              <SelectItem value="assignment">Assignments</SelectItem>
            </SelectContent>
          </Select>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All users" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {(members.data ?? []).map((m: any) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.profile?.full_name ?? m.profile?.email ?? m.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Search activities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="ml-auto text-xs text-muted-foreground">{filtered.length} events</div>
        </div>
      </Card>

      {activity.isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading...</Card>
      ) : grouped.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Activity className="mx-auto mb-2 size-8 opacity-50" />
          No activity matches.
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day}</div>
              <Card className="divide-y">
                {items.map((a) => {
                  const Icon = ICONS[a.activity_type] ?? Activity;
                  return (
                    <div key={a.id} className="flex gap-3 p-3">
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="size-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2 text-sm">
                          <span className="font-medium">{a.user?.full_name ?? a.user?.email ?? "System"}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {a.activity_type.replace("_", " ")}
                          </Badge>
                          <span className="text-muted-foreground">on</span>
                          <Link
                            to="/crm/$leadId"
                            params={{ leadId: a.lead_id }}
                            className="font-medium text-primary hover:underline"
                          >
                            {a.lead?.customer_name ?? "—"}
                          </Link>
                          {a.lead?.company_name && (
                            <span className="text-muted-foreground">· {a.lead.company_name}</span>
                          )}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {formatDistanceToNow(parseISO(a.occurred_at), { addSuffix: true })}
                          </span>
                        </div>
                        {a.title && <div className="mt-0.5 text-sm">{a.title}</div>}
                        {a.body && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{a.body}</div>}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
