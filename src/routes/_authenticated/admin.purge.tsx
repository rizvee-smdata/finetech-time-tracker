import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { adminListCompanies } from "@/lib/admin.functions";
import { purgeCompanyData } from "@/lib/admin/purge.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/purge")({
  component: PurgePage,
  head: () => ({
    meta: [
      { title: "Purge Company Data | Admin" },
      {
        name: "description",
        content:
          "Erase test and demo records for a workspace so the company can go live with a clean database.",
      },
      { property: "og:title", content: "Purge Company Data | Admin" },
      {
        property: "og:description",
        content: "Erase test and demo records so a workspace can go live clean.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type PurgeResult = {
  company: string;
  mode: string;
  total_rows: number;
  per_table: Record<string, number>;
  skipped: string[];
};

function PurgePage() {
  const { isSuperAdmin } = useAuth();
  const listCompanies = useServerFn(adminListCompanies);
  const purge = useServerFn(purgeCompanyData);

  const [companyId, setCompanyId] = useState("");
  const [mode, setMode] = useState<"data" | "all">("data");
  const [confirm, setConfirm] = useState("");
  const [result, setResult] = useState<PurgeResult | null>(null);

  const { data: companies } = useQuery({
    queryKey: ["admin-companies-purge"],
    enabled: isSuperAdmin,
    queryFn: () => listCompanies(),
  });

  const selected = (companies ?? []).find((c: any) => c.id === companyId);

  const run = useMutation({
    mutationFn: () =>
      purge({ data: { company_id: companyId, mode, confirm } }) as Promise<PurgeResult>,
    onSuccess: (res) => {
      setResult(res);
      setConfirm("");
      toast.success(`Purged ${res.total_rows} rows from ${res.company}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Purge failed"),
  });

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Super admins only.
          </CardContent>
        </Card>
      </div>
    );
  }

  const canRun = !!companyId && !!selected && confirm === selected.name && !run.isPending;

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Purge company data</h1>
        <p className="text-sm text-muted-foreground">
          Wipe testing / demo records so a workspace can go live with a clean slate. User
          accounts, memberships, licences and platform settings are always preserved.
        </p>
      </div>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" /> This cannot be undone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Company</Label>
            <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setConfirm(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
              <SelectContent>
                {(companies ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>What to purge</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "data" | "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="data">
                  Transactional data only (keeps products, categories, templates, statuses,
                  settings)
                </SelectItem>
                <SelectItem value="all">
                  Everything (also clears catalogue, templates and configuration lists)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Removes leads, deals, quotes, customers, visits, check-ins, tasks, projects,
              expenses, time entries, contracts, chat, reports and audit history for the selected
              company.
            </p>
          </div>

          <div className="space-y-2">
            <Label>
              Type <span className="font-mono">{selected?.name ?? "the company name"}</span> to
              confirm
            </Label>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={selected?.name ?? ""}
              disabled={!companyId}
            />
          </div>

          <Button
            variant="destructive"
            disabled={!canRun}
            onClick={() => run.mutate()}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {run.isPending ? "Purging…" : "Purge data permanently"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Purged {result.total_rows} rows from {result.company}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {Object.entries(result.per_table)
              .sort((a, b) => b[1] - a[1])
              .map(([t, n]) => (
                <div key={t} className="flex justify-between border-b py-1 last:border-0">
                  <span className="font-mono text-xs">{t}</span>
                  <span>{n}</span>
                </div>
              ))}
            {result.skipped?.length > 0 && (
              <p className="pt-2 text-xs text-muted-foreground">
                Skipped (constraints): {result.skipped.join(", ")}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
