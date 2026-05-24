import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AIProvider } from "@/lib/ai/context";
import { AIAgent } from "@/components/global/AIAgent";

export const Route = createFileRoute("/_authenticated")({
  component: () => (
    <AIProvider>
      <AppShell />
      <AIAgent />
    </AIProvider>
  ),
});
