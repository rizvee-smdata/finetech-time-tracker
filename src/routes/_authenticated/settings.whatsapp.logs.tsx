import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { LogTable } from "./settings.whatsapp";

export const Route = createFileRoute("/_authenticated/settings/whatsapp/logs")({
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { id: string } }).user;
    if (!user) throw redirect({ to: "/auth" });
  },
  component: WhatsAppLogsPage,
});

function WhatsAppLogsPage() {
  const { companyId, isStaff } = useAuth();
  const [direction, setDirection] = useState<"all" | "inbound" | "outbound">("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  if (!isStaff) return <Card className="p-8 text-center text-sm text-muted-foreground">Admins & managers only.</Card>;
  if (!companyId) return <Card className="p-8">Select a company first.</Card>;

  const { data, isLoading } = useQuery({
    queryKey: ["wa-log-full", companyId, direction, status, search],
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_message_log")
        .select("id, created_at, direction, phone, body, status, template_key, user_id, profiles:profiles!whatsapp_message_log_user_id_fkey(full_name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (direction !== "all") q = q.eq("direction", direction);
      if (status !== "all") q = q.eq("status", status);
      if (search.trim()) q = q.or(`body.ilike.%${search}%,phone.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      type Row = { id: string; created_at: string; direction: string; phone: string; body: string | null; status: string; template_key: string | null; user_id: string | null; profiles?: { full_name: string | null } | null };
      return (data as unknown as Row[]).map((r) => ({ ...r, rep_name: r.profiles?.full_name ?? null }));
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WhatsApp message log</h1>
          <p className="text-sm text-muted-foreground">All sent & received messages for this company.</p>
        </div>
        <Button variant="outline" asChild><Link to="/settings/whatsapp"><ArrowLeft className="h-4 w-4 mr-2" />WhatsApp settings</Link></Button>
      </div>

      <Card className="p-4 flex flex-wrap gap-3">
        <Input className="max-w-xs" placeholder="Search phone or body…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={direction} onValueChange={(v: typeof direction) => setDirection(v)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All directions</SelectItem>
            <SelectItem value="outbound">Outbound</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="read">Read</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="p-0 overflow-hidden">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : <LogTable rows={data ?? []} withRep />}
      </Card>
    </div>
  );
}
