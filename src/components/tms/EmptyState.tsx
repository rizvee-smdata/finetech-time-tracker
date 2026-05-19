import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="p-10 flex flex-col items-center justify-center text-center gap-3">
      <div className="p-3 rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>}
      </div>
      {action}
    </Card>
  );
}
