import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/tms/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AssigneeProfile } from "@/lib/tms/types";

export function AssigneeAvatars({
  people,
  size = "sm",
  max = 3,
}: {
  people: AssigneeProfile[];
  size?: "xs" | "sm" | "md";
  max?: number;
}) {
  const sizeCls = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-xs" }[size];
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;
  return (
    <div className="flex -space-x-1.5">
      {visible.map((p) => {
        const name = (p.full_name ?? "").trim() || "Unassigned";
        return (
          <Tooltip key={p.id}>
            <TooltipTrigger asChild>
              <Avatar className={cn(sizeCls, "ring-2 ring-background")}>
                {p.avatar_url && <AvatarImage src={p.avatar_url} alt={name} />}
                <AvatarFallback className={cn(sizeCls, "bg-primary/10 text-primary font-medium")}>
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        );
      })}
      {overflow > 0 && (
        <Avatar className={cn(sizeCls, "ring-2 ring-background")}>
          <AvatarFallback className={cn(sizeCls, "bg-muted text-muted-foreground")}>
            +{overflow}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
