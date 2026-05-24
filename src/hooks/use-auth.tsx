import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { installServerFnAuthFetch } from "@/lib/server-fn-fetch";

installServerFnAuthFetch();

export type AppRole = "admin" | "manager" | "employee";

export interface Company {
  id: string;
  name: string;
  slug: string;
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  companies: Company[];
  companyId: string | null;
  company: Company | null;
  loading: boolean;
  ready: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  setCompanyId: (id: string | null) => void;
  refreshCompanies: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);
const STORAGE_KEY = "lavisho.activeCompany";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setCompanyId = useCallback((id: string | null) => {
    setCompanyIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const loadCompanies = useCallback(async () => {
    const { data } = await supabase.from("companies").select("id, name, slug").order("name");
    const list = (data ?? []) as Company[];
    setCompanies(list);
    setCompanyIdState((prev) => {
      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const candidate = prev ?? stored;
      if (candidate && list.some((c) => c.id === candidate)) return candidate;
      const next = list[0]?.id ?? null;
      if (typeof window !== "undefined") {
        if (next) localStorage.setItem(STORAGE_KEY, next);
        else localStorage.removeItem(STORAGE_KEY);
      }
      return next;
    });
  }, []);

  const loadRoles = useCallback(async (uid: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        void Promise.all([loadRoles(data.session.user.id), loadCompanies()]).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        setTimeout(() => {
          if (!mounted) return;
          loadRoles(s.user.id);
          loadCompanies();
        }, 0);
      } else {
        setRoles([]);
        setCompanies([]);
        setCompanyId(null);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    roles,
    companies,
    companyId,
    company: companies.find((c) => c.id === companyId) ?? null,
    loading,
    ready: !loading && !!session?.user,
    isStaff: roles.includes("admin") || roles.includes("manager"),
    isAdmin: roles.includes("admin"),
    setCompanyId,
    refreshCompanies: loadCompanies,
    signOut: async () => {
      await supabase.auth.signOut();
      setCompanyId(null);
      window.location.href = "/auth";
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
