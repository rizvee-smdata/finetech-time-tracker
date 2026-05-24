import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Bookmark, BookmarkPlus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;

export type SavedFilters = Record<string, unknown>;

export type SavedView = {
  id: string;
  name: string;
  filters: SavedFilters;
  is_shared: boolean;
  user_id: string;
};

export function SavedViewsMenu({
  currentFilters,
  onApply,
}: {
  currentFilters: SavedFilters;
  onApply: (f: SavedFilters) => void;
}) {
  const { companyId, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);

  const views = useQuery({
    queryKey: ["crm-saved-views", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("crm_saved_views")
        .select("id, name, filters, is_shared, user_id")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as SavedView[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("crm_saved_views").insert({
        company_id: companyId,
        user_id: user!.id,
        name: name.trim(),
        filters: currentFilters,
        is_shared: shared,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("View saved");
      setOpen(false); setName(""); setShared(false);
      qc.invalidateQueries({ queryKey: ["crm-saved-views"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("crm_saved_views").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("View deleted");
      qc.invalidateQueries({ queryKey: ["crm-saved-views"] });
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Bookmark className="mr-2 h-4 w-4" />Views
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {(views.data ?? []).length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">No saved views yet.</div>
          )}
          {(views.data ?? []).map((v) => (
            <DropdownMenuItem
              key={v.id}
              onSelect={(e) => { e.preventDefault(); onApply(v.filters); }}
              className="flex items-center justify-between gap-2 group"
            >
              <span className="flex items-center gap-2 truncate">
                {v.is_shared && <Users className="h-3 w-3 text-muted-foreground" />}
                <span className="truncate">{v.name}</span>
              </span>
              {v.user_id === user?.id && (
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Delete view "${v.name}"?`)) remove.mutate(v.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  aria-label="Delete view"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
            <BookmarkPlus className="mr-2 h-4 w-4" />Save current filters…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save view</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My open hot leads" autoFocus />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={shared} onCheckedChange={(v) => setShared(!!v)} />
              Share with team
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
