import { Search, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PipelineFiltersValue = {
  query: string;
  healthStatus: "all" | "healthy" | "at_risk" | "stalling";
  industry: string;
  assignedTo: string;
  sortBy: "health" | "lastContact" | "value" | "close";
};

type Props = {
  value: PipelineFiltersValue;
  onChange: (v: PipelineFiltersValue) => void;
  industries: string[];
  assignees: string[];
  onRecalculate: () => void;
};

export function PipelineFilters({ value, onChange, industries, assignees, onRecalculate }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/40 p-3 backdrop-blur">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
          placeholder="Search deals or clients..."
          className="pl-8"
        />
      </div>
      <Select
        value={value.healthStatus}
        onValueChange={(v) => onChange({ ...value, healthStatus: v as PipelineFiltersValue["healthStatus"] })}
      >
        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Health" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Health</SelectItem>
          <SelectItem value="healthy">🟢 Healthy</SelectItem>
          <SelectItem value="at_risk">🟡 At Risk</SelectItem>
          <SelectItem value="stalling">🔴 Stalling</SelectItem>
        </SelectContent>
      </Select>
      <Select value={value.industry} onValueChange={(v) => onChange({ ...value, industry: v })}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Industry" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Industries</SelectItem>
          {industries.map((i) => (
            <SelectItem key={i} value={i}>{i}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value.assignedTo} onValueChange={(v) => onChange({ ...value, assignedTo: v })}>
        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Owner" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Owners</SelectItem>
          {assignees.map((a) => (
            <SelectItem key={a} value={a}>{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={value.sortBy}
        onValueChange={(v) => onChange({ ...value, sortBy: v as PipelineFiltersValue["sortBy"] })}
      >
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Sort" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="health">Health Score</SelectItem>
          <SelectItem value="lastContact">Last Contact</SelectItem>
          <SelectItem value="value">Deal Value</SelectItem>
          <SelectItem value="close">Expected Close</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={onRecalculate}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Recalculate
      </Button>
    </div>
  );
}
