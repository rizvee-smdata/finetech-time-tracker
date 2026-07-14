import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCurrencies } from "@/lib/currency/currency.functions";

export function CurrencySelect({
  value,
  onChange,
  placeholder = "Currency",
  className,
}: {
  value?: string | null;
  onChange: (code: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const list = useServerFn(listCurrencies);
  const q = useQuery({ queryKey: ["currencies"], queryFn: () => list(), staleTime: 60_000 * 60 });
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {(q.data ?? []).map((c: any) => (
          <SelectItem key={c.code} value={c.code}>
            {c.code} — {c.name} ({c.symbol})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
