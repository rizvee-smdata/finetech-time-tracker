import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TIME_CATEGORIES, type TimeCategory } from "@/lib/time/types";
import { useDealsStore } from "@/lib/deals/storage";
import { useTimeStore } from "@/lib/time/storage";
import { toast } from "sonner";

export function ManualEntryDialog() {
  const { deals } = useDealsStore();
  const { addEntry } = useTimeStore();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<TimeCategory>("Admin");
  const [dealId, setDealId] = useState<string>("__none");
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [billable, setBillable] = useState(false);

  function submit() {
    if (!desc.trim()) { toast.error("Description required"); return; }
    const startISO = new Date(`${date}T${start}:00`);
    const endISO = new Date(`${date}T${end}:00`);
    const duration = Math.max(1, Math.round((endISO.getTime() - startISO.getTime()) / 60000));
    if (duration <= 0) { toast.error("End must be after start"); return; }
    const deal = dealId === "__none" ? undefined : deals.find((d) => d.id === dealId);
    addEntry({
      description: desc, rawDescription: desc,
      dealId: deal?.id, clientName: deal?.clientName, clientCompany: deal?.clientCompany,
      category: cat, billable,
      startTime: startISO.toISOString(), endTime: endISO.toISOString(),
      duration, aiClassified: false, tags: [],
    });
    toast.success("Entry logged");
    setOpen(false);
    setDesc("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" /> Quick add</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log past work</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={cat} onValueChange={(v) => setCat(v as TimeCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIME_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Deal</Label>
              <Select value={dealId} onValueChange={setDealId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {deals.filter((d) => d.stage !== "Closed Lost").map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.clientCompany}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Start</Label><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>End</Label><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="flex items-center gap-2"><Switch checked={billable} onCheckedChange={setBillable} /> <span className="text-sm">Billable</span></div>
        </div>
        <DialogFooter>
          <Button onClick={submit} className="bg-violet-600 hover:bg-violet-500 text-white">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
