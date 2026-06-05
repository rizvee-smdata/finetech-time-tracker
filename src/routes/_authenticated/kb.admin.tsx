import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, lazy, Suspense, useRef } from "react";
import { ArrowLeft, Plus, Trash2, Save, Upload, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { listOems, listArticles, ARTICLE_TYPES, uploadAttachment, articleTypeLabel, stripHtml, type KbArticle } from "@/lib/kb";
import "react-quill-new/dist/quill.snow.css";

const ReactQuill = lazy(() => import("react-quill-new"));

export const Route = createFileRoute("/_authenticated/kb/admin")({
  component: KbAdmin,
});

type Draft = {
  id?: string;
  draftId: string;
  oem_id: string | null;
  title: string;
  article_type: string;
  summary: string;
  content_html: string;
  tags: string;
  published: boolean;
  attachments: KbArticle["attachments"];
  version: number;
};

function makeEmptyDraft(): Draft {
  return {
    draftId: (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : `draft-${Date.now()}`,
    oem_id: null,
    title: "",
    article_type: "product_spec",
    summary: "",
    content_html: "",
    tags: "",
    published: false,
    attachments: [],
    version: 1,
  };
}

function KbAdmin() {
  const { user, isStaff } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => makeEmptyDraft());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isStaff) navigate({ to: "/kb" });
  }, [isStaff, navigate]);

  const { data: oems = [] } = useQuery({ queryKey: ["kb-oems"], queryFn: listOems });
  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["kb-admin-articles"],
    queryFn: () => listArticles({ publishedOnly: false, limit: 200 }),
  });

  const oemMap = useMemo(() => new Map(oems.map((o) => [o.id, o.name])), [oems]);

  function startNew() { setDraft(makeEmptyDraft()); }
  function loadArticle(a: KbArticle) {
    setDraft({
      id: a.id,
      draftId: a.id,
      oem_id: a.oem_id,
      title: a.title,
      article_type: a.article_type,
      summary: a.summary ?? "",
      content_html: a.content_html,
      tags: (a.tags ?? []).join(", "),
      published: a.published,
      attachments: a.attachments ?? [],
      version: a.version,
    });
  }

  async function save() {
    if (!draft.title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      const payload = {
        oem_id: draft.oem_id,
        title: draft.title.trim(),
        article_type: draft.article_type,
        summary: draft.summary.trim() || null,
        content_html: draft.content_html,
        content_text: stripHtml(draft.content_html),
        tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean),
        attachments: draft.attachments,
        published: draft.published,
        updated_by: user?.id ?? null,
      };

      if (draft.id) {
        // Snapshot current version before updating
        const { data: existing } = await supabase
          .from("kb_articles" as never)
          .select("title, content_html, summary, version")
          .eq("id", draft.id)
          .maybeSingle();
        const e = existing as unknown as { title: string; content_html: string; summary: string | null; version: number } | null;
        if (e) {
          await supabase.from("kb_article_versions" as never).insert({
            article_id: draft.id,
            version: e.version,
            title: e.title,
            content_html: e.content_html,
            summary: e.summary,
            edited_by: user?.id ?? null,
          } as never);
        }
        const { error } = await supabase
          .from("kb_articles" as never)
          .update({ ...payload, version: (e?.version ?? 1) + 1 } as never)
          .eq("id", draft.id);
        if (error) throw error;
        toast.success("Article updated");
      } else {
        const { data, error } = await supabase
          .from("kb_articles" as never)
          .insert({ ...payload, created_by: user?.id ?? null } as never)
          .select()
          .single();
        if (error) throw error;
        toast.success("Article created");
        setDraft((d) => ({ ...d, id: (data as { id: string }).id }));
      }
      qc.invalidateQueries({ queryKey: ["kb-admin-articles"] });
      qc.invalidateQueries({ queryKey: ["kb-recent"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this article? This cannot be undone.")) return;
    const { error } = await supabase.from("kb_articles" as never).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    if (draft.id === id) setDraft(makeEmptyDraft());
    qc.invalidateQueries({ queryKey: ["kb-admin-articles"] });
  }

  async function handleUpload(file: File) {
    try {
      const att = await uploadAttachment(file, draft.draftId);
      const newList = [...draft.attachments, att];
      setDraft({ ...draft, attachments: newList });
      if (draft.id) {
        await supabase.from("kb_articles" as never).update({ attachments: newList } as never).eq("id", draft.id);
      }
      toast.success("Attached");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="container max-w-7xl py-6 space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/kb" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Knowledge base
        </Link>
        <Button onClick={startNew} variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" /> New article</Button>
      </div>
      <h1 className="text-2xl font-bold">Knowledge Base Admin</h1>

      <div className="grid lg:grid-cols-[300px_1fr] gap-4">
        <Card className="p-3 max-h-[80vh] overflow-auto">
          <div className="font-semibold text-sm mb-2">Articles ({articles.length})</div>
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          <div className="space-y-1">
            {articles.map((a) => (
              <button
                key={a.id}
                onClick={() => loadArticle(a)}
                className={`w-full text-left p-2 rounded text-sm hover:bg-muted ${draft.id === a.id ? "bg-muted" : ""}`}
              >
                <div className="font-medium line-clamp-1">{a.title}</div>
                <div className="flex items-center gap-1 mt-1">
                  <Badge variant="secondary" className="text-xs">{articleTypeLabel(a.article_type)}</Badge>
                  {!a.published && <Badge variant="outline" className="text-xs">Draft</Badge>}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Title</Label>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div>
              <Label>OEM</Label>
              <Select value={draft.oem_id ?? "none"} onValueChange={(v) => setDraft({ ...draft, oem_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Select OEM" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {oems.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={draft.article_type} onValueChange={(v) => setDraft({ ...draft, article_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ARTICLE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tags (comma-separated)</Label>
              <Input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="firewall, sd-wan" />
            </div>
          </div>
          <div>
            <Label>Summary</Label>
            <Textarea value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} rows={2} />
          </div>
          <div>
            <Label>Content</Label>
            <Suspense fallback={<div className="h-64 border rounded animate-pulse bg-muted/30" />}>
              <div className="bg-background">
                <ReactQuill
                  theme="snow"
                  value={draft.content_html}
                  onChange={(html) => setDraft({ ...draft, content_html: html })}
                />
              </div>
            </Suspense>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="pub" checked={draft.published} onCheckedChange={(v) => setDraft({ ...draft, published: v })} />
            <Label htmlFor="pub">Published</Label>
          </div>

          {draft.id && (
            <div className="space-y-2">
              <Label>Attachments</Label>
              <div className="flex flex-wrap gap-2">
                {draft.attachments.map((a) => (
                  <Badge key={a.path} variant="outline">{a.name}</Badge>
                ))}
              </div>
              <label className="inline-flex">
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
                />
                <Button type="button" variant="outline" size="sm" asChild>
                  <span><Upload className="h-4 w-4 mr-1" /> Upload PDF/file</span>
                </Button>
              </label>
            </div>
          )}

          <div className="flex justify-between gap-2 pt-2 border-t">
            {draft.id ? (
              <Button variant="destructive" size="sm" onClick={() => remove(draft.id!)}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            ) : <span />}
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {draft.id ? "Update" : "Create"}
            </Button>
          </div>
          {draft.id && <div className="text-xs text-muted-foreground">Current version: v{draft.version}{oemMap.get(draft.oem_id ?? "") ? ` · ${oemMap.get(draft.oem_id!)}` : ""}</div>}
        </Card>
      </div>
    </div>
  );
}
