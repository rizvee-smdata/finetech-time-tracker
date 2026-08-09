import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Clock, Building2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Lavisho Time Tracker" },
      { name: "description", content: "Sign in to the Lavisho Group field activity, customer visit and follow-up tracker." },
      { property: "og:title", content: "Sign in — Lavisho Time Tracker" },
      { property: "og:description", content: "Sign in to the Lavisho Group field activity, customer visit and follow-up tracker." },
      { property: "og:url", content: "https://lavisho-log-time.lovable.app/auth" },
    ],
    links: [
      { rel: "canonical", href: "https://lavisho-log-time.lovable.app/auth" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(72),
});

const STORAGE_KEY = "lavisho.activeCompany";

type Step = "auth" | "pickCompany";

function getSsoTokenFromHash() {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/(?:^|[#&])sso=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function stripSsoTokenFromUrl() {
  const hash = window.location.hash;
  const newHash = hash.replace(/(^|[#&])sso=[^&]*/, "").replace(/^#&?/, "#");
  const cleaned = newHash === "#" || newHash === "" ? "" : newHash;
  window.history.replaceState(null, "", window.location.pathname + window.location.search + cleaned);
}

function AuthPage() {
  const nav = useNavigate();
  const ssoStartedRef = useRef(false);
  const [step, setStep] = useState<Step>("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [picked, setPicked] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forceLogout = params.get("logout") === "1";
    const deactivated = params.get("deactivated") === "1";
    const ssoToken = getSsoTokenFromHash();
    if (deactivated) {
      toast.error("This account has been deactivated. Contact your administrator.");
      window.history.replaceState({}, "", "/auth");
    }

    (async () => {
      if (forceLogout) {
        await supabase.auth.signOut();
        localStorage.removeItem(STORAGE_KEY);
        toast.success("Signed out.");
        // strip the query param
        window.history.replaceState({}, "", "/auth");
        return;
      }
      if (ssoToken && !ssoStartedRef.current) {
        ssoStartedRef.current = true;
        stripSsoTokenFromUrl();
        
        setBusy(true);
        try {
          const res = await fetch("/api/sso/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sig: ssoToken }),
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) throw new Error(body?.error ?? "SSO verification failed");
          const username = typeof body?.username === "string" ? body.username : "";
          const ssoPassword = typeof body?.password === "string" ? body.password : "";
          if (!username || !ssoPassword) throw new Error("SSO credentials missing");

          setEmail(username);
          setPassword(ssoPassword);
          const { data, error } = await supabase.auth.signInWithPassword({
            email: username,
            password: ssoPassword,
          });
          if (error) throw error;
          await routeAfterAuth(data.user?.id);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "SSO sign-in failed";
          toast.error(msg);
        } finally {
          setBusy(false);
        }
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) await routeAfterAuth();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function routeAfterAuth(userId?: string) {
    const currentUserId = userId ?? (await supabase.auth.getSession()).data.session?.user?.id;
    if (!currentUserId) {
      window.location.href = "/dashboard";
      return;
    }

    // Force password change on first login / after admin reset
    const { data: prof } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", currentUserId)
      .maybeSingle();
    if (prof?.must_change_password) {
      nav({ to: "/change-password" });
      return;
    }


    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", currentUserId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    const { data: comps } = await supabase.from("companies").select("id, name").order("name");
    const list = comps ?? [];
    if (list.length === 0) {
      if (isAdmin) {
        // first-time admin: skip company picking, can create in settings
        nav({ to: "/settings" });
      } else {
        toast.error("You're not assigned to any company yet. Contact an admin.");
        await supabase.auth.signOut();
      }
      return;
    }
    if (list.length === 1) {
      localStorage.setItem(STORAGE_KEY, list[0].id);
      nav({ to: "/dashboard" });
      return;
    }
    setCompanies(list);
    const stored = localStorage.getItem(STORAGE_KEY);
    setPicked(stored && list.some((c) => c.id === stored) ? stored : list[0].id);
    setStep("pickCompany");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await routeAfterAuth(data.user?.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Authentication failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function continueWithCompany() {
    if (!picked) return;
    localStorage.setItem(STORAGE_KEY, picked);
    nav({ to: "/dashboard" });
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "var(--gradient-soft)" }}
    >
      <Card className="w-full max-w-md p-8 shadow-[var(--shadow-elegant)]">
        <div className="mb-6 flex items-center gap-3">
          <div
            className="grid h-12 w-12 place-items-center rounded-xl text-primary-foreground font-bold"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Lavisho Time Tracker — Field Activity &amp; Reporting</h1>
            <p className="text-sm text-muted-foreground">Field activity & visit reporting</p>
          </div>
        </div>

        {step === "pickCompany" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="h-4 w-4 text-primary" />
              Select your company
            </div>
            <p className="text-sm text-muted-foreground">
              You belong to multiple Lavisho Group companies. Choose which one to work in.
            </p>
            <Select value={picked} onValueChange={setPicked}>
              <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="w-full" onClick={continueWithCompany}>Continue</Button>
            <button type="button" className="w-full text-xs text-muted-foreground hover:underline"
              onClick={async () => { await supabase.auth.signOut(); setStep("auth"); }}>
              Sign in as a different user
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={submit} className="space-y-4" autoComplete="off">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@lavisho.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Please wait..." : "Sign in"}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Accounts are created by your administrator. Contact your admin if you need access.
            </p>
          </>
        )}
      </Card>
    </main>
  );
}
