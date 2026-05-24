import { useEffect, useState, useCallback, useMemo } from "react";
import type { Proposal, ProposalSection, TemplateBlock, WizardDraft } from "./types";
import { seedProposals } from "./seed";
import { DEFAULT_BLOCKS } from "./templates";
import { useAuth } from "@/hooks/use-auth";

const PROP_BASE = "deskiq_proposals";
const BLOCKS_BASE = "deskiq_proposal_blocks";
const DRAFT_KEY = "deskiq_proposal_wizard_draft";
const PROP_SEEDED_FLAG = "deskiq_proposals::__seeded__";

const scoped = (base: string, companyId: string | null | undefined) =>
  companyId ? `${base}::${companyId}` : `${base}::__none__`;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function readProposals(key: string): Proposal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Proposal[];

    // Legacy migration: adopt old un-scoped data into this company once
    const legacy = localStorage.getItem(PROP_BASE);
    if (legacy) {
      localStorage.setItem(key, legacy);
      localStorage.removeItem(PROP_BASE);
      return JSON.parse(legacy) as Proposal[];
    }

    // First time: seed once. Other companies start empty so switching is visible.
    if (!localStorage.getItem(PROP_SEEDED_FLAG)) {
      const seeded = seedProposals();
      localStorage.setItem(key, JSON.stringify(seeded));
      localStorage.setItem(PROP_SEEDED_FLAG, "1");
      return seeded;
    }

    localStorage.setItem(key, "[]");
    return [];
  } catch {
    return [];
  }
}

function readBlocks(key: string): TemplateBlock[] {
  if (typeof window === "undefined") return DEFAULT_BLOCKS;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(DEFAULT_BLOCKS));
      return DEFAULT_BLOCKS;
    }
    return JSON.parse(raw) as TemplateBlock[];
  } catch {
    return DEFAULT_BLOCKS;
  }
}

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

export function useProposalsStore() {
  const { companyId } = useAuth();
  const propKey = useMemo(() => scoped(PROP_BASE, companyId), [companyId]);
  const blocksKey = useMemo(() => scoped(BLOCKS_BASE, companyId), [companyId]);

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [blocks, setBlocks] = useState<TemplateBlock[]>([]);

  useEffect(() => {
    setProposals(readProposals(propKey));
    setBlocks(readBlocks(blocksKey));
    const fn = () => {
      setProposals(readProposals(propKey));
      setBlocks(readBlocks(blocksKey));
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, [propKey, blocksKey]);

  const saveAll = useCallback((next: Proposal[]) => {
    write(propKey, next);
    notify();
  }, [propKey]);

  const upsert = useCallback(
    (p: Proposal, changeNote = "Manual update") => {
      const current = readProposals(propKey);
      const idx = current.findIndex((x) => x.id === p.id);
      const prev = idx >= 0 ? current[idx] : undefined;
      const history = prev
        ? [
            ...(prev.history ?? []).slice(-9),
            {
              version: prev.version,
              createdAt: prev.updatedAt,
              sections: prev.sections,
              changeNote,
            },
          ]
        : p.history ?? [];
      const next: Proposal = {
        ...p,
        version: prev ? prev.version + 1 : p.version || 1,
        updatedAt: new Date().toISOString(),
        history,
      };
      const updated =
        idx >= 0
          ? current.map((x, i) => (i === idx ? next : x))
          : [next, ...current];
      saveAll(updated);
      return next;
    },
    [saveAll, propKey],
  );

  const updateInPlace = useCallback(
    (p: Proposal) => {
      const current = readProposals(propKey);
      const next = current.map((x) => (x.id === p.id ? { ...p, updatedAt: new Date().toISOString() } : x));
      saveAll(next);
    },
    [saveAll, propKey],
  );

  const remove = useCallback(
    (id: string) => {
      const next = readProposals(propKey).filter((x) => x.id !== id);
      saveAll(next);
    },
    [saveAll, propKey],
  );

  const duplicate = useCallback(
    (id: string) => {
      const current = readProposals(propKey);
      const src = current.find((x) => x.id === id);
      if (!src) return null;
      const copy: Proposal = {
        ...src,
        id: uid(),
        title: `${src.title} (Copy)`,
        status: "draft",
        version: 1,
        history: [],
        sections: src.sections.map((s) => ({ ...s, id: uid() })),
        proposedProducts: src.proposedProducts.map((p) => ({ ...p, id: uid() })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sentAt: undefined,
        decidedAt: undefined,
      };
      saveAll([copy, ...current]);
      return copy;
    },
    [saveAll, propKey],
  );

  const replaceSection = useCallback(
    (proposalId: string, section: ProposalSection) => {
      const current = readProposals(propKey);
      const next = current.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              sections: p.sections.map((s) => (s.id === section.id ? { ...section, edited: true } : s)),
              updatedAt: new Date().toISOString(),
            }
          : p,
      );
      saveAll(next);
    },
    [saveAll, propKey],
  );

  const upsertBlock = useCallback((block: TemplateBlock) => {
    const current = readBlocks(blocksKey);
    const idx = current.findIndex((b) => b.id === block.id);
    const next = idx >= 0 ? current.map((b, i) => (i === idx ? block : b)) : [block, ...current];
    write(blocksKey, next);
    notify();
  }, [blocksKey]);

  const removeBlock = useCallback((id: string) => {
    const next = readBlocks(blocksKey).filter((b) => b.id !== id);
    write(blocksKey, next);
    notify();
  }, [blocksKey]);

  return {
    proposals,
    blocks,
    upsert,
    updateInPlace,
    remove,
    duplicate,
    replaceSection,
    upsertBlock,
    removeBlock,
  };
}

export function useWizardDraft() {
  const [draft, setDraft] = useState<WizardDraft | null>(() =>
    read<WizardDraft | null>(DRAFT_KEY, null),
  );

  const save = useCallback((d: WizardDraft | null) => {
    if (!d) {
      if (typeof window !== "undefined") localStorage.removeItem(DRAFT_KEY);
      setDraft(null);
      return;
    }
    write(DRAFT_KEY, d);
    setDraft(d);
  }, []);

  return { draft, save };
}

export { uid as proposalUid };
