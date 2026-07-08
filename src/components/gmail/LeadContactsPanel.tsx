import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Trash2, Plus, Mail } from "lucide-react";
import { syncGmailForMe } from "@/lib/gmail/sync.functions";

const sb = supabase as any;

export function LeadContactsPanel({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const syncFn = useServerFn(syncGmailForMe);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("");
  const [phone, setPhone] = useState("");

  const contacts = useQuery({
    queryKey: ["lead-contacts", leadId],
    queryFn: async () => {
      const { data } = await sb
        .from("lead_contacts")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!email.trim()) throw new Error("Email required");
      const { error } = await sb.from("lead_contacts").insert({
        lead_id: leadId,
        email: email.trim(),
        name: name.trim() || null,
        designation: designation.trim() || null,
        phone: phone.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact added");
      setName(""); setEmail(""); setDesignation(""); setPhone("");
      qc.invalidateQueries({ queryKey: ["lead-contacts", leadId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("lead_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-contacts", leadId] }),
  });

  const syncNow = useMutation({
    mutationFn: () => syncFn({ data: { leadId } }),
    onSuccess: (r) => {
      toast.success(`Synced — ${r.newEmails} new emails`);
      qc.invalidateQueries({ queryKey: ["lead-emails", leadId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Add contact</div>
        <div className="grid gap-2 md:grid-cols-4">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Email *" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="Designation" value={designation} onChange={(e) => setDesignation(e.target.value)} />
          <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add contact
          </Button>
          <Button size="sm" variant="outline" onClick={() => syncNow.mutate()} disabled={syncNow.isPending}>
            <Mail className="h-4 w-4 mr-1" /> Sync emails for this lead
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Emails you exchange with these addresses are pulled into the Emails tab.
        </p>
      </Card>

      <div className="space-y-2">
        {(contacts.data ?? []).length === 0 && (
          <div className="text-sm text-muted-foreground text-center p-6 border rounded-md">
            No contacts yet. Add the customer's email addresses to enable Gmail matching.
          </div>
        )}
        {(contacts.data ?? []).map((c: any) => (
          <div key={c.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div>
              <div className="font-medium">{c.name || c.email}</div>
              <div className="text-muted-foreground">
                {c.email}
                {c.designation && ` · ${c.designation}`}
                {c.phone && ` · ${c.phone}`}
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => del.mutate(c.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
