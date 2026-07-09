import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchCompanyMembers } from "@/lib/crm/queries";

export function AssigneeFilter({
  companyId,
  value,
  onChange,
  className = "w-48",
}: {
  companyId: string | null | undefined;
  value: string; // "all" | "unassigned" | userId
  onChange: (v: string) => void;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["crm-members", companyId, "include-company-admins"],
    enabled: !!companyId,
    queryFn: () => fetchCompanyMembers(companyId!),
    refetchOnMount: "always",
  });
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Sales person" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All sales people</SelectItem>
        <SelectItem value="unassigned">Unassigned</SelectItem>
        {(data ?? []).map((m) => (
          <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
