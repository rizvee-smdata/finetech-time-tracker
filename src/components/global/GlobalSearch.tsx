import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Search as SearchIcon, TrendingUp, Mic, FileText, Clock, CheckSquare } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useDealsStore } from "@/lib/deals/storage";
import { useMeetingsStore } from "@/lib/meetings/storage";
import { useProposalsStore } from "@/lib/proposals/storage";
import { useTimeStore } from "@/lib/time/storage";

type Hit = {
  id: string;
  module: "deal" | "meeting" | "proposal" | "time" | "action";
  label: string;
  sub?: string;
  onSelect: () => void;
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();
  const { deals } = useDealsStore();
  const { meetings } = useMeetingsStore();
  const { proposals } = useProposalsStore();
  const { entries } = useTimeStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hits = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out: Record<string, Hit[]> = {
      deal: [],
      meeting: [],
      proposal: [],
      time: [],
      action: [],
    };
    const match = (s: string) => !term || s.toLowerCase().includes(term);

    deals.forEach((d) => {
      if (match(`${d.title} ${d.clientName} ${d.clientCompany}`)) {
        out.deal.push({
          id: `d-${d.id}`,
          module: "deal",
          label: d.title,
          sub: `${d.clientCompany} · ${d.clientName}`,
          onSelect: () => {
            setOpen(false);
            router.navigate({ to: "/deals/$dealId", params: { dealId: d.id } });
          },
        });
      }
      (d.nextBestActions ?? []).forEach((a) => {
        if (match(a.action)) {
          out.action.push({
            id: `a-${a.id}`,
            module: "action",
            label: a.action,
            sub: `${d.clientCompany} · ${a.urgency}`,
            onSelect: () => {
              setOpen(false);
              router.navigate({ to: "/deals/$dealId", params: { dealId: d.id } });
            },
          });
        }
      });
    });

    meetings.forEach((m) => {
      if (match(`${m.title} ${m.clientCompany} ${m.rawNotes} ${m.processed?.summary ?? ""}`)) {
        out.meeting.push({
          id: `m-${m.id}`,
          module: "meeting",
          label: m.title,
          sub: `${m.clientCompany} · ${new Date(m.date).toLocaleDateString()}`,
          onSelect: () => {
            setOpen(false);
            router.navigate({ to: "/meetings" });
          },
        });
      }
    });

    proposals.forEach((p) => {
      if (match(`${p.title} ${p.clientCompany} ${p.clientName}`)) {
        out.proposal.push({
          id: `p-${p.id}`,
          module: "proposal",
          label: p.title,
          sub: `${p.clientCompany} · ${p.status}`,
          onSelect: () => {
            setOpen(false);
            router.navigate({ to: "/proposals/$proposalId", params: { proposalId: p.id } });
          },
        });
      }
    });

    entries.slice(0, 200).forEach((e) => {
      if (match(`${e.description} ${e.clientCompany ?? ""}`)) {
        out.time.push({
          id: `t-${e.id}`,
          module: "time",
          label: e.description,
          sub: `${e.category} · ${e.duration}m`,
          onSelect: () => {
            setOpen(false);
            router.navigate({ to: "/time" });
          },
        });
      }
    });

    Object.keys(out).forEach((k) => {
      out[k] = out[k].slice(0, 6);
    });
    return out;
  }, [q, deals, meetings, proposals, entries, router]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label="Open global search"
      >
        <SearchIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="ml-1 hidden rounded border border-border bg-muted px-1.5 text-[10px] font-mono sm:inline">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search deals, meetings, proposals, time entries…"
          value={q}
          onValueChange={setQ}
        />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {hits.deal.length > 0 && (
            <CommandGroup heading="Deals">
              {hits.deal.map((h) => (
                <CommandItem key={h.id} onSelect={h.onSelect}>
                  <TrendingUp className="mr-2 h-3.5 w-3.5 text-emerald-400" />
                  <span className="flex-1">{h.label}</span>
                  <span className="text-xs text-muted-foreground">{h.sub}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {hits.meeting.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Meetings">
                {hits.meeting.map((h) => (
                  <CommandItem key={h.id} onSelect={h.onSelect}>
                    <Mic className="mr-2 h-3.5 w-3.5 text-blue-400" />
                    <span className="flex-1">{h.label}</span>
                    <span className="text-xs text-muted-foreground">{h.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {hits.proposal.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Proposals">
                {hits.proposal.map((h) => (
                  <CommandItem key={h.id} onSelect={h.onSelect}>
                    <FileText className="mr-2 h-3.5 w-3.5 text-emerald-400" />
                    <span className="flex-1">{h.label}</span>
                    <span className="text-xs text-muted-foreground">{h.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {hits.time.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Time entries">
                {hits.time.map((h) => (
                  <CommandItem key={h.id} onSelect={h.onSelect}>
                    <Clock className="mr-2 h-3.5 w-3.5 text-violet-400" />
                    <span className="flex-1">{h.label}</span>
                    <span className="text-xs text-muted-foreground">{h.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {hits.action.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Next best actions">
                {hits.action.map((h) => (
                  <CommandItem key={h.id} onSelect={h.onSelect}>
                    <CheckSquare className="mr-2 h-3.5 w-3.5 text-amber-400" />
                    <span className="flex-1">{h.label}</span>
                    <span className="text-xs text-muted-foreground">{h.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
