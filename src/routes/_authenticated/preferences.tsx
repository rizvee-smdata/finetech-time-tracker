import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettings } from "@/lib/app/settings";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/preferences")({
  component: PreferencesPage,
});

function PreferencesPage() {
  const { settings, update, reset } = useSettings();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Preferences</h1>
          <p className="text-sm text-muted-foreground">
            DeskIQ defaults used across meetings, deals, time tracking, and proposals.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { reset(); toast.success("Reset to defaults"); }}>
          Reset
        </Button>
      </header>

      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="hours">Working Hours</TabsTrigger>
          <TabsTrigger value="health">Health Thresholds</TabsTrigger>
          <TabsTrigger value="proposals">Proposal Defaults</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-5">
          <Field label="Company name">
            <Input
              value={settings.company.name}
              onChange={(e) => update({ company: { ...settings.company, name: e.target.value } })}
            />
          </Field>
          <Field label="Tagline">
            <Input
              value={settings.company.tagline}
              onChange={(e) => update({ company: { ...settings.company, tagline: e.target.value } })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input
                value={settings.company.phone}
                onChange={(e) => update({ company: { ...settings.company, phone: e.target.value } })}
              />
            </Field>
            <Field label="Email">
              <Input
                value={settings.company.email}
                onChange={(e) => update({ company: { ...settings.company, email: e.target.value } })}
              />
            </Field>
            <Field label="Website">
              <Input
                value={settings.company.website}
                onChange={(e) => update({ company: { ...settings.company, website: e.target.value } })}
              />
            </Field>
            <Field label="Currency">
              <Select
                value={settings.company.currency}
                onValueChange={(v) => update({ company: { ...settings.company, currency: v as "BDT" | "USD" } })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BDT">BDT (৳)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Address">
            <Textarea
              rows={2}
              value={settings.company.address}
              onChange={(e) => update({ company: { ...settings.company, address: e.target.value } })}
            />
          </Field>
        </TabsContent>

        <TabsContent value="hours" className="space-y-5 rounded-lg border border-border/60 bg-card/40 p-5">
          <Field label={`Daily target — ${settings.workingHours.dailyTargetHours}h`}>
            <Slider
              min={4} max={12} step={1}
              value={[settings.workingHours.dailyTargetHours]}
              onValueChange={([v]) => update({ workingHours: { ...settings.workingHours, dailyTargetHours: v } })}
            />
          </Field>
          <Field label={`Billable target — ${settings.workingHours.billableTargetHours}h`}>
            <Slider
              min={2} max={10} step={1}
              value={[settings.workingHours.billableTargetHours]}
              onValueChange={([v]) => update({ workingHours: { ...settings.workingHours, billableTargetHours: v } })}
            />
          </Field>
          <div>
            <div className="mb-2 text-sm font-medium">Working days</div>
            <div className="flex flex-wrap gap-2">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => {
                const on = settings.workingHours.workingDays.includes(i);
                return (
                  <button
                    key={d}
                    onClick={() => {
                      const days = on
                        ? settings.workingHours.workingDays.filter((x) => x !== i)
                        : [...settings.workingHours.workingDays, i].sort();
                      update({ workingHours: { ...settings.workingHours, workingDays: days } });
                    }}
                    className={`rounded-md border px-3 py-1.5 text-xs ${on ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground"}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="health" className="space-y-5 rounded-lg border border-border/60 bg-card/40 p-5">
          <Field label={`Healthy threshold — ${settings.healthThresholds.healthy}+`}>
            <Slider
              min={50} max={90} step={5}
              value={[settings.healthThresholds.healthy]}
              onValueChange={([v]) => update({ healthThresholds: { ...settings.healthThresholds, healthy: v } })}
            />
          </Field>
          <Field label={`At-risk threshold — under ${settings.healthThresholds.atRisk}`}>
            <Slider
              min={20} max={60} step={5}
              value={[settings.healthThresholds.atRisk]}
              onValueChange={([v]) => update({ healthThresholds: { ...settings.healthThresholds, atRisk: v } })}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Deals scoring above the healthy threshold show green; below the at-risk threshold show red.
          </p>
        </TabsContent>

        <TabsContent value="proposals" className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Default validity (days)">
              <Input
                type="number"
                value={settings.proposalDefaults.validityDays}
                onChange={(e) => update({ proposalDefaults: { ...settings.proposalDefaults, validityDays: Number(e.target.value) || 30 } })}
              />
            </Field>
            <Field label="Confidentiality">
              <Select
                value={settings.proposalDefaults.confidentiality}
                onValueChange={(v) => update({ proposalDefaults: { ...settings.proposalDefaults, confidentiality: v as "public" | "confidential" | "strictly_confidential" } })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="confidential">Confidential</SelectItem>
                  <SelectItem value="strictly_confidential">Strictly Confidential</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Company boilerplate">
            <Textarea
              rows={3}
              value={settings.proposalDefaults.boilerplate}
              onChange={(e) => update({ proposalDefaults: { ...settings.proposalDefaults, boilerplate: e.target.value } })}
            />
          </Field>
          <Field label="Default terms">
            <Textarea
              rows={3}
              value={settings.proposalDefaults.defaultTerms}
              onChange={(e) => update({ proposalDefaults: { ...settings.proposalDefaults, defaultTerms: e.target.value } })}
            />
          </Field>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-5">
          {(["urgent","today","update","win"] as const).map((cat) => (
            <div key={cat} className="flex items-center justify-between rounded-md border border-border/40 p-3">
              <div>
                <div className="text-sm font-medium capitalize">{cat} alerts</div>
                <div className="text-xs text-muted-foreground">
                  {cat === "urgent" && "Stalling deals and budget overruns."}
                  {cat === "today" && "Items due today across modules."}
                  {cat === "update" && "Meeting links, time logged, score changes."}
                  {cat === "win" && "Closed-won deals and accepted proposals."}
                </div>
              </div>
              <Switch
                checked={settings.notifications[cat]}
                onCheckedChange={(on) => update({ notifications: { ...settings.notifications, [cat]: on } })}
              />
            </div>
          ))}
          <Field label={`Stalling alert when score drops below ${settings.notifications.stallingThreshold}`}>
            <Slider
              min={20} max={70} step={5}
              value={[settings.notifications.stallingThreshold]}
              onValueChange={([v]) => update({ notifications: { ...settings.notifications, stallingThreshold: v } })}
            />
          </Field>
          <Field label={`Budget alert at ${settings.notifications.budgetThresholdPct}% consumption`}>
            <Slider
              min={50} max={100} step={5}
              value={[settings.notifications.budgetThresholdPct]}
              onValueChange={([v]) => update({ notifications: { ...settings.notifications, budgetThresholdPct: v } })}
            />
          </Field>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
