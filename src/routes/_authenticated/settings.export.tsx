import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportTenantData } from "@/lib/tenants/export.functions";

export const Route = createFileRoute("/_authenticated/settings/export")({
  component: ExportPage,
});

function ExportPage() {
  const { companyId, company, isAdmin } = useAuth();
  const [busy, setBusy] = useState(false);
  const runExport = useServerFn(exportTenantData);

  async function handleExport() {
    if (!companyId) return;
    setBusy(true);
    try {
      const dump = await runExport({ data: { companyId } });
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${company?.slug || "workspace"}-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (e) {
      toast.error((e as Error).message || "Export failed");
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return <div className="p-6 text-muted-foreground">Admins only.</div>;
  }

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Data export</h1>
        <p className="text-sm text-muted-foreground">
          Download a JSON dump of every record in <strong>{company?.name}</strong>. Useful for backups,
          audits, or fulfilling data-subject requests.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Full workspace export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Includes companies, members, leads, quotes, contracts, expenses, visits, tasks, and audit
            logs scoped to your workspace.
          </p>
          <Button onClick={handleExport} disabled={busy}>
            {busy ? "Preparing…" : "Download JSON"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
