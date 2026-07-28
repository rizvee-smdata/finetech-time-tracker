import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getMyLicense } from "./licenses.functions";

export type LicenseInfo = {
  state: "active" | "expiring_soon" | "in_grace" | "read_only" | "locked";
  reason?: string;
  license_id?: string;
  edition?: string;
  status?: string;
  max_users?: number | null;
  seats_used?: number;
  starts_at?: string | null;
  expires_at?: string | null;
  grace_days?: number;
  days_remaining?: number | null;
  customer_name?: string;
};

export const EDITION_LABEL: Record<string, string> = {
  time_tracker: "Time Tracker",
  crm: "CRM",
  suite: "Suite (Time Tracker + CRM)",
};

/** License state for the active organization, cached for 15 minutes. */
export function useLicense() {
  const { companyId, ready } = useAuth();
  const fn = useServerFn(getMyLicense);
  const q = useQuery({
    queryKey: ["license-state", companyId],
    enabled: ready && !!companyId,
    staleTime: 15 * 60 * 1000,
    queryFn: () => fn({ data: { company_id: companyId } }) as Promise<LicenseInfo>,
  });
  const info = q.data;
  return {
    info,
    loading: q.isLoading,
    refetch: q.refetch,
    state: info?.state,
    readOnly: info?.state === "read_only",
    locked: info?.state === "locked",
    canWrite: !info || (info.state !== "read_only" && info.state !== "locked"),
  };
}
