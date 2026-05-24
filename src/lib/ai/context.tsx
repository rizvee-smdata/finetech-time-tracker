import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type AIContextEntity = {
  type: "deal" | "lead" | "meeting" | "proposal" | "task" | "visit";
  id: string;
  label: string;
};

export type AIRouteContext = {
  route: string;
  summary: string;
  entities: AIContextEntity[];
};

type Ctx = {
  context: AIRouteContext;
  setContext: (c: AIRouteContext) => void;
  open: boolean;
  setOpen: (b: boolean) => void;
  initialPrompt: string | null;
  openWith: (prompt: string) => void;
  consumeInitialPrompt: () => string | null;
};

const AICtx = createContext<Ctx | null>(null);

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<AIRouteContext>({
    route: "/",
    summary: "DeskIQ home",
    entities: [],
  });
  const [open, setOpen] = useState(false);
  const initialRef = useRef<string | null>(null);
  const [, force] = useState(0);

  const openWith = useCallback((prompt: string) => {
    initialRef.current = prompt;
    setOpen(true);
    force((x) => x + 1);
  }, []);

  const consumeInitialPrompt = useCallback(() => {
    const v = initialRef.current;
    initialRef.current = null;
    return v;
  }, []);

  // CMD+J / CTRL+J
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ context, setContext, open, setOpen, initialPrompt: initialRef.current, openWith, consumeInitialPrompt }),
    [context, open, openWith, consumeInitialPrompt],
  );

  return <AICtx.Provider value={value}>{children}</AICtx.Provider>;
}

export function useAI() {
  const ctx = useContext(AICtx);
  if (!ctx) throw new Error("useAI must be inside <AIProvider>");
  return ctx;
}

/** Register page context for the agent (call once per route component). */
export function useRegisterAIContext(input: Omit<AIRouteContext, "route"> & { route?: string }) {
  const { setContext } = useAI();
  useEffect(() => {
    setContext({
      route: input.route ?? (typeof window !== "undefined" ? window.location.pathname : "/"),
      summary: input.summary,
      entities: input.entities,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.summary, JSON.stringify(input.entities)]);
}
