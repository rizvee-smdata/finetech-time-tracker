import { Badge } from "@/components/ui/badge";
import { PRIORITY_COLORS, type Priority } from "@/lib/tms/types";
import { cn } from "@/lib/utils";

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge variant="outline" className={cn("border-transparent capitalize", PRIORITY_COLORS[priority])}>
      {priority}
    </Badge>
  );
}
