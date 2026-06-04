import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, MessageSquare, Save, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/whatsapp")({
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { id: string } }).user;
    if (!user) throw redirect({ to: "/auth" });
  },
  component: WhatsAppSettingsPage,
});

const DEFAULT_TEMPLATES: Record<string, { label: string; body: string; help: string }> = {
  morning_briefing: {
    label: "Morning briefing",
    body: "Good morning, {name}! 🌅\n*Today — {date}*\n📋 Tasks: {task_count} planned\n📍 Visits: {visit_count} scheduled\n🎯 Target: {achievement}% achieved this month\n⚠️ Follow-ups due: {followup_count}\n\nReply *MENU* for more options.",
    help: "Variables: {name} {date} {task_count} {visit_count} {achievement} {followup_count}",
  },
  deal_won_rep: {
    label: "Deal won — rep",
    body: "Deal Won! 🎉 {client} - ৳{amount}",
    help: "Variables: {client} {amount} {currency} {product}",
  },
  deal_won_manager: {
    label: "Deal won — manager",
    body: "{rep_name} just closed {client} for ৳{amount}!",
    help: "Variables: {rep_name} {client} {amount} {currency}",
  },
};

type Settings = {
  id?: string;
  company_id: string;
  morning_briefing_enabled: boolean;
  morning_briefing_time: string;
  deal_won_rep_enabled: boolean;
  deal_won_manager_enabled: boolean;
  inbound_commands_enabled: boolean;
  expense_capture_enabled: boolean;
  followup_threshold_days: number;
};

function WhatsAppSettingsPage() {
  const { companyId, isStaff } = useAuth();
  const qc = useQueryClient();

  if (!isStaff) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Admins & managers only.</Card>;
  }
  if (!companyId) return <Card className="p-8">Select a company first.</Card>;

  return <SettingsInner companyId={companyId} qc={qc} />;
}

function SettingsInner({ companyId, qc }: { companyId: string; qc: ReturnType<typeof useQueryClient> }) {
  const settingsQ = useQuery({
    queryKey: ["wa-settings", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_settings").select("*").eq("company_id", companyId).maybeSingle();
      return (data ?? {
        company_id: companyId,
        morning_briefing_enabled: true,
        morning_briefing_time: "08:00:00",
        deal_won_rep_enabled: true,
        deal_won_manager_enabled: true,
        inbound_commands_enabled: true,
        expense_capture_enabled: true,
        followup_threshold_days: 3,
      }) as Settings;
    },
  });

  const tplQ = useQuery({
    queryKey: ["wa-templates", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_templates").select("*").eq("company_id", companyId);
      const map: Record<string, { body: string; enabled: boolean }> = {};
      for (const t of data ?? []) map[t.key] = { body: t.body, enabled: t.enabled };
      return map;
    },
  });

  const repsQ = useQuery({
    queryKey: ["wa-reps", companyId],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("company_members")
        .select("user_id, profiles!inner(id, full_name, email, whatsapp_number)")
        .eq("company_id", companyId);
      return ((members ?? []) as unknown as Array<{ user_id: string; profiles: { id: string; full_name: string | null; email: string; whatsapp_number: string | null } }>)
        .map((m) => m.profiles)
        .sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));
    },
  });

  const recentLogQ = useQuery({
    queryKey: ["wa-log-recent", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_message_log")
        .select("id, created_at, direction, phone, body, status, template_key")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(15);
      return data ?? [];
    },
  });

  const [local, setLocal] = useState<Settings | null>(null);
  const [templates, setTemplates] = useState<Record<string, { body: string; enabled: boolean }>>({});
  useEffect(() => { if (settingsQ.data) setLocal(settingsQ.data); }, [settingsQ.data]);
  useEffect(() => {
    if (tplQ.data) {
      const next: Record<string, { body: string; enabled: boolean }> = {};
      for (const [k, v] of Object.entries(DEFAULT_TEMPLATES)) {
        next[k] = tplQ.data[k] ?? { body: v.body, enabled: true };
      }
      setTemplates(next);
    }
  }, [tplQ.data]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!local) return;
      const { error } = await supabase.from("whatsapp_settings").upsert({ ...local, company_id: companyId }, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["wa-settings", companyId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTemplates = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(templates).map(([key, v]) => ({ company_id: companyId, key, body: v.body, enabled: v.enabled }));
      const { error } = await supabase.from("whatsapp_templates").upsert(rows, { onConflict: "company_id,key" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Templates saved"); qc.invalidateQueries({ queryKey: ["wa-templates", companyId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRepNumber = useMutation({
    mutationFn: async ({ id, whatsapp_number }: { id: string; whatsapp_number: string | null }) => {
      const { error } = await supabase.from("profiles").update({ whatsapp_number }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["wa-reps", companyId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const triggerBriefing = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("send-morning-briefing", { body: {} });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Morning briefing dispatched"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" /> WhatsApp Bot
          </h1>
          <p className="text-sm text-muted-foreground">WATI integration, message templates, and per-rep WhatsApp numbers.</p>
        </div>
        <Button variant="outline" asChild><Link to="/settings"><ArrowLeft className="h-4 w-4 mr-2" />Settings</Link></Button>
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="reps">Reps</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="logs">Recent log</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Card className="p-6 space-y-5">
            {!local ? <div className="text-sm text-muted-foreground">Loading…</div> : (
              <>
                <ToggleRow label="Morning briefing" description="Daily summary at 8 AM Dhaka (cron: 02:00 UTC, Mon–Sat)." value={local.morning_briefing_enabled} onChange={(v) => setLocal({ ...local, morning_briefing_enabled: v })} />
                <div className="grid grid-cols-2 gap-4 max-w-md">
                  <div>
                    <Label>Briefing time (local)</Label>
                    <Input type="time" value={local.morning_briefing_time.slice(0, 5)} onChange={(e) => setLocal({ ...local, morning_briefing_time: e.target.value + ":00" })} />
                  </div>
                  <div>
                    <Label>Follow-up threshold (days)</Label>
                    <Input type="number" min={1} value={local.followup_threshold_days} onChange={(e) => setLocal({ ...local, followup_threshold_days: Number(e.target.value) })} />
                  </div>
                </div>
                <ToggleRow label="Deal won — notify rep" description="Send a celebration message when a lead moves to won." value={local.deal_won_rep_enabled} onChange={(v) => setLocal({ ...local, deal_won_rep_enabled: v })} />
                <ToggleRow label="Deal won — notify managers" description="Send the same win to admins & managers in the company." value={local.deal_won_manager_enabled} onChange={(v) => setLocal({ ...local, deal_won_manager_enabled: v })} />
                <ToggleRow label="Inbound commands" description="Reps can text MENU, TASKS, SCORE, EXPENSE." value={local.inbound_commands_enabled} onChange={(v) => setLocal({ ...local, inbound_commands_enabled: v })} />
                <ToggleRow label="Expense capture" description="Image + 'expense {amount}' creates a submitted expense." value={local.expense_capture_enabled} onChange={(v) => setLocal({ ...local, expense_capture_enabled: v })} />
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}><Save className="h-4 w-4 mr-2" />Save settings</Button>
                  <Button variant="outline" onClick={() => triggerBriefing.mutate()} disabled={triggerBriefing.isPending}><Send className="h-4 w-4 mr-2" />Send briefing now</Button>
                </div>
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="reps">
          <Card className="p-6">
            <div className="mb-3 text-sm text-muted-foreground">Link each rep's WhatsApp number (digits only, with country code, e.g. <code>8801712345678</code>).</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rep</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[260px]">WhatsApp number</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(repsQ.data ?? []).map((r) => (
                  <RepRow key={r.id} rep={r} onSave={(n) => setRepNumber.mutate({ id: r.id, whatsapp_number: n })} />
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card className="p-6 space-y-5">
            {Object.entries(DEFAULT_TEMPLATES).map(([key, meta]) => {
              const t = templates[key] ?? { body: meta.body, enabled: true };
              return (
                <div key={key} className="space-y-2 border-b border-border pb-5 last:border-0">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium">{meta.label}</Label>
                    <Switch checked={t.enabled} onCheckedChange={(v) => setTemplates({ ...templates, [key]: { ...t, enabled: v } })} />
                  </div>
                  <Textarea rows={5} value={t.body} onChange={(e) => setTemplates({ ...templates, [key]: { ...t, body: e.target.value } })} className="font-mono text-sm" />
                  <p className="text-xs text-muted-foreground">{meta.help}</p>
                </div>
              );
            })}
            <Button onClick={() => saveTemplates.mutate()} disabled={saveTemplates.isPending}><Save className="h-4 w-4 mr-2" />Save templates</Button>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="text-sm text-muted-foreground">Latest 15 messages</div>
              <Button variant="outline" size="sm" asChild><Link to="/settings/whatsapp/logs">Full log</Link></Button>
            </div>
            <LogTable rows={recentLogQ.data ?? []} />
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="p-4 bg-muted/30 text-sm space-y-1">
        <div className="font-medium">Webhook URL</div>
        <code className="block text-xs break-all">{`https://ejiaxmvzolqgfcawgyvl.supabase.co/functions/v1/wati-webhook`}</code>
        <div className="text-xs text-muted-foreground">Configure in WATI. Send <code>x-wati-secret</code> header matching the <code>WATI_WEBHOOK_SECRET</code> project secret.</div>
      </Card>
    </div>
  );
}

function ToggleRow({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function RepRow({ rep, onSave }: { rep: { id: string; full_name: string | null; email: string; whatsapp_number: string | null }; onSave: (n: string | null) => void }) {
  const [v, setV] = useState(rep.whatsapp_number ?? "");
  const dirty = v !== (rep.whatsapp_number ?? "");
  return (
    <TableRow>
      <TableCell>{rep.full_name ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{rep.email}</TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="8801712345678" />
          <Button size="sm" variant="outline" disabled={!dirty} onClick={() => onSave(v.trim() ? v.trim() : null)}>Save</Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function LogTable({ rows, withRep = false }: { rows: Array<{ id: string; created_at: string; direction: string; phone: string; body: string | null; status: string; template_key?: string | null; user_id?: string | null; rep_name?: string | null }>; withRep?: boolean }) {
  const fmt = useMemo(() => new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short" }), []);
  if (!rows.length) return <div className="p-6 text-sm text-muted-foreground text-center">No messages yet.</div>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Direction</TableHead>
          {withRep && <TableHead>Rep</TableHead>}
          <TableHead>Phone</TableHead>
          <TableHead>Preview</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap text-xs">{fmt.format(new Date(r.created_at))}</TableCell>
            <TableCell>
              <Badge variant={r.direction === "outbound" ? "default" : "secondary"}>{r.direction}</Badge>
            </TableCell>
            {withRep && <TableCell className="text-xs">{r.rep_name ?? "—"}</TableCell>}
            <TableCell className="font-mono text-xs">{r.phone}</TableCell>
            <TableCell className="max-w-md truncate text-xs">{r.body ?? ""}</TableCell>
            <TableCell>
              <Badge variant={r.status === "failed" ? "destructive" : r.status === "sent" || r.status === "delivered" || r.status === "read" ? "default" : "outline"}>{r.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
