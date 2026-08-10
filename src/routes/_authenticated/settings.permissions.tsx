import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ShieldCheck, Plus, Trash2, Pencil } from "lucide-react";
import { FIELD_CATALOG, RECORD_VISIBILITY_OPTIONS, type FieldMap } from "@/lib/permissions/fields";
import {
  listPermissionProfiles, upsertPermissionProfile, deletePermissionProfile,
  listProfileAssignments, assignPermissionProfile,
} from "@/lib/permissions/permissions.functions";

export const Route = createFileRoute("/_authenticated/settings/permissions")({
  head: () => ({
    meta: [
      { title: "Permissions & field visibility — Settings" },
      { name: "description", content: "Control record visibility and hide or lock sensitive fields per group of users." },
      { property: "og:title", content: "Permissions & field visibility" },
      { property: "og:description", content: "Granular record and field-level permissions for your workspace." },
    ],
  }),
  component: PermissionsSettingsPage,
});

type ProfileRow = {
  id: string;
  name: string;
  description: string | null;
  record_visibility: "own" | "team" | "company";
  hidden_fields: FieldMap;
  readonly_fields: FieldMap;
};

const emptyDraft = {
  id: undefined as string | undefined,
  name: "",
  description: "",
  record_visibility: "company" as ProfileRow["record_visibility"],
  hidden_fields: {} as FieldMap,
  readonly_fields: {} as FieldMap,
};

function toggle(map: FieldMap, entity: string, field: string): FieldMap {
  const current = map[entity] ?? [];
  const next = current.includes(field) ? current.filter((f) => f !== field) : [...current, field];
  const out = { ...map, [entity]: next };
  if (!next.length) delete out[entity];
  return out;
}

function PermissionsSettingsPage() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const listProfiles = useServerFn(listPermissionProfiles);
  const upsert = useServerFn(upsertPermissionProfile);
  const remove = useServerFn(deletePermissionProfile);
  const listAssignments = useServerFn(listProfileAssignments);
  const assign = useServerFn(assignPermissionProfile);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  const profiles = useQuery({
    queryKey: ["permission-profiles", companyId],
    queryFn: () => listProfiles({ data: { companyId: companyId! } }) as Promise<ProfileRow[]>,
    enabled: !!companyId,
  });

  const members = useQuery({
    queryKey: ["permission-assignments", companyId],
    queryFn: () => listAssignments({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          id: draft.id,
          companyId: companyId!,
          name: draft.name,
          description: draft.description || null,
          record_visibility: draft.record_visibility,
          hidden_fields: draft.hidden_fields,
          readonly_fields: draft.readonly_fields,
        },
      }),
    onSuccess: () => {
      toast.success("Permission profile saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["permission-profiles"] });
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Profile deleted");
      qc.invalidateQueries({ queryKey: ["permission-profiles"] });
      qc.invalidateQueries({ queryKey: ["permission-assignments"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const assignMut = useMutation({
    mutationFn: (v: { userId: string; profileId: string | null }) => assign({ data: v }),
    onSuccess: () => {
      toast.success("Assignment updated");
      qc.invalidateQueries({ queryKey: ["permission-assignments"] });
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const profileById = useMemo(
    () => Object.fromEntries((profiles.data ?? []).map((p) => [p.id, p])),
    [profiles.data],
  );

  if (!companyId) return <p className="p-6 text-sm text-muted-foreground">Select a company first.</p>;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6" /> Permissions &amp; field visibility
          </h1>
          <p className="text-sm text-muted-foreground">
            Define who can see which records, and hide or lock sensitive fields such as deal value, margin or contact details.
          </p>
        </div>
        <Button onClick={() => { setDraft(emptyDraft); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New profile
        </Button>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Permission profiles</h2>
        {profiles.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !profiles.data?.length ? (
          <p className="text-sm text-muted-foreground">
            No profiles yet. Everyone keeps their role-based access until you create one.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Record visibility</TableHead>
                <TableHead>Hidden fields</TableHead>
                <TableHead>Read-only fields</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {RECORD_VISIBILITY_OPTIONS.find((o) => o.value === p.record_visibility)?.label}
                  </TableCell>
                  <TableCell>
                    <FieldBadges map={p.hidden_fields} />
                  </TableCell>
                  <TableCell>
                    <FieldBadges map={p.readonly_fields} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setDraft({
                          id: p.id,
                          name: p.name,
                          description: p.description ?? "",
                          record_visibility: p.record_visibility,
                          hidden_fields: p.hidden_fields ?? {},
                          readonly_fields: p.readonly_fields ?? {},
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Assign users</h2>
        {members.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-72">Permission profile</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(members.data ?? []).map((m: any) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-medium">{m.full_name || m.email}</div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.is_active === false ? "outline" : "secondary"}>
                      {m.is_active === false ? "Inactive" : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={m.permission_profile_id ?? "none"}
                      onValueChange={(v) =>
                        assignMut.mutate({ userId: m.id, profileId: v === "none" ? null : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Default (role-based)">
                          {m.permission_profile_id
                            ? profileById[m.permission_profile_id]?.name ?? "Default (role-based)"
                            : "Default (role-based)"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Default (role-based)</SelectItem>
                        {(profiles.data ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit profile" : "New permission profile"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1 block text-xs">Name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Junior sales rep"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Record visibility</Label>
                <Select
                  value={draft.record_visibility}
                  onValueChange={(v) => setDraft({ ...draft, record_visibility: v as ProfileRow["record_visibility"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECORD_VISIBILITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {RECORD_VISIBILITY_OPTIONS.find((o) => o.value === draft.record_visibility)?.hint}
                </p>
              </div>
            </div>

            <div>
              <Label className="mb-1 block text-xs">Description</Label>
              <Input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Who this profile is for"
              />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold">Field rules</p>
              {FIELD_CATALOG.map((group) => (
                <Card key={group.entity} className="p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{group.label}</p>
                  <div className="space-y-2">
                    {group.fields.map((f) => (
                      <div key={f.key} className="flex items-center justify-between gap-4">
                        <span className="text-sm">{f.label}</span>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={(draft.hidden_fields[group.entity] ?? []).includes(f.key)}
                              onCheckedChange={() =>
                                setDraft({ ...draft, hidden_fields: toggle(draft.hidden_fields, group.entity, f.key) })
                              }
                            />
                            Hidden
                          </label>
                          <label className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={(draft.readonly_fields[group.entity] ?? []).includes(f.key)}
                              onCheckedChange={() =>
                                setDraft({ ...draft, readonly_fields: toggle(draft.readonly_fields, group.entity, f.key) })
                              }
                            />
                            Read-only
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!draft.name.trim() || saveMut.isPending}>
              Save profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldBadges({ map }: { map: FieldMap }) {
  const entries = Object.entries(map ?? {}).flatMap(([entity, fields]) =>
    (fields ?? []).map((f) => {
      const group = FIELD_CATALOG.find((g) => g.entity === entity);
      return group?.fields.find((x) => x.key === f)?.label ?? f;
    }),
  );
  if (!entries.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map((label) => (
        <Badge key={label} variant="outline" className="text-xs">{label}</Badge>
      ))}
    </div>
  );
}
