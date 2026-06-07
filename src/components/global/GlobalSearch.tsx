import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Search as SearchIcon, TrendingUp, FileText, CheckSquare } from "lucide-react";
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

import { useProposalsStore } from "@/lib/proposals/storage";


type Hit = {
  id: string;
  module: "deal" | "proposal" | "action";
  label: string;
  sub?: string;
  onSelect: () => void;
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();
  const { deals } = useDealsStore();
  
  const { proposals } = useProposalsStore();
  

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
      proposal: [],
      action: [],
    };
    const words = term.split(/\s+/).filter(Boolean);
    const match = (s: string) => {
      if (words.length === 0) return true;
      const haystack = s.toLowerCase();
      // Word-based: every search word must match a whole word in the haystack.
      return words.every((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(haystack));
    };

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

    Object.keys(out).forEach((k) => {
      out[k] = out[k].slice(0, 6);
    });
    return out;
  }, [q, deals, proposals, router]);

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
          placeholder="Search deals, proposals, actions…"
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
