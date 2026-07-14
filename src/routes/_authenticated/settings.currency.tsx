import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CurrencySelect } from "@/components/currency/CurrencySelect";
import { Coins } from "lucide-react";
import {
  getBaseCurrency, setBaseCurrency, listRates, upsertRate,
} from "@/lib/currency/currency.functions";

export const Route = createFileRoute("/_authenticated/settings/currency")({
  head: () => ({ meta: [{ title: "Currency & FX — Settings" }] }),
  component: CurrencySettingsPage,
});

function CurrencySettingsPage() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const getBase = useServerFn(getBaseCurrency);
  const setBase = useServerFn(setBaseCurrency);
  const listR = useServerFn(listRates);
  const upsertR = useServerFn(upsertRate);

  const base = useQuery({
    queryKey: ["base-currency", companyId],
    queryFn: () => getBase({ data: { companyId: companyId! } }),
    enabled: !!companyId,
  });

  const rates = useQuery({
    queryKey: ["rates", base.data],
    queryFn: () => listR({ data: { base: base.data } }),
    enabled: !!base.data,
  });

  const setBaseMut = useMutation({
    mutationFn: (code: string) => setBase({ data: { companyId: companyId!, code } }),
    onSuccess: () => { toast.success("Base currency updated"); qc.invalidateQueries({ queryKey: ["base-currency"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [rate, setRate] = useState<string>("");

  const addRateMut = useMutation({
    mutationFn: () => upsertR({ data: { from_code: from, to_code: to, rate: Number(rate) } }),
    onSuccess: () => { toast.success("Rate saved"); qc.invalidateQueries({ queryKey: ["rates"] }); setRate(""); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!companyId) return <p className="p-6 text-sm text-muted-foreground">Select a company first.</p>;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Coins className="h-6 w-6" /> Currency & exchange rates
        </h1>
        <p className="text-sm text-muted-foreground">
          Set your company's reporting currency and maintain FX rates used across quotes, contracts, expenses and forecasts.
        </p>
      </div>

      <Card className="p-4">
        <Label className="mb-2 block">Base (reporting) currency</Label>
        <div className="flex items-end gap-2 max-w-md">
          <CurrencySelect value={base.data} onChange={(c) => setBaseMut.mutate(c)} />
          <span className="text-xs text-muted-foreground">Changes take effect immediately.</span>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Add / update rate</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label className="mb-1 block text-xs">From</Label>
            <CurrencySelect value={from} onChange={setFrom} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">To</Label>
            <CurrencySelect value={to} onChange={setTo} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Rate (1 From = ? To)</Label>
            <Input type="number" step="0.0001" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 1.09" />
          </div>
          <div className="flex items-end">
            <Button
              disabled={!from || !to || !rate || from === to || addRateMut.isPending}
              onClick={() => addRateMut.mutate()}
            >
              Save rate
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Rates are date-stamped. Newer rates override older ones automatically.
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Recent rates {base.data ? `from ${base.data}` : ""}</h2>
        {rates.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (rates.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No rates yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead>As of</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rates.data ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.from_code}</TableCell>
                  <TableCell>{r.to_code}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.rate).toFixed(4)}</TableCell>
                  <TableCell>{r.as_of}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
