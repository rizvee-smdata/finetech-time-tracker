import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Copy as CopyIcon } from "lucide-react";
import { useProposalsStore } from "@/lib/proposals/storage";
import { proposalUid } from "@/lib/proposals/storage";
import type { TemplateBlock } from "@/lib/proposals/types";

export const Route = createFileRoute("/_authenticated/proposals/templates")({
  component: TemplateManagerPage,
});

function TemplateManagerPage() {
  const { blocks, upsertBlock, removeBlock } = useProposalsStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TemplateBlock>({
    id: "",
    title: "",
    category: "General",
    content: "<p></p>",
  });

  function save() {
    if (!draft.title || !draft.content) {
      toast.error("Title and content are required");
      return;
    }
    upsertBlock({ ...draft, id: draft.id || proposalUid() });
    toast.success("Block saved");
    setOpen(false);
    setDraft({ id: "", title: "", category: "General", content: "<p></p>" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Reusable content blocks you can paste into any section.
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-500 hover:bg-emerald-600">
              <Plus className="mr-1 h-4 w-4" /> New Block
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Template Block</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <Input placeholder="Category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
              <Textarea
                rows={8}
                placeholder="HTML content"
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                className="font-mono text-xs"
              />
              <Button className="w-full bg-emerald-500 hover:bg-emerald-600" onClick={save}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {blocks.map((b) => (
          <Card key={b.id} className="border-border/60 bg-card/40 backdrop-blur">
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold">{b.title}</div>
                <Badge variant="outline" className="text-[10px]">{b.category}</Badge>
              </div>
              <div
                className="prose prose-sm max-w-none rounded-md bg-white/5 p-2 text-xs text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: b.content }}
              />
              <div className="flex flex-wrap gap-1 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(b.content);
                    toast.success("Copied — paste into a section");
                  }}
                >
                  <CopyIcon className="mr-1 h-3 w-3" /> Copy
                </Button>
                {!b.builtIn && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-red-400 hover:text-red-300"
                    onClick={() => {
                      if (confirm("Delete this block?")) removeBlock(b.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
