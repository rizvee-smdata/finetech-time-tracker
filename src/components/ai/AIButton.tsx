import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  loading?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default";
  className?: string;
};

export function AIButton({ loading, onClick, children, variant = "outline", size = "sm", className }: Props) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={loading}
      variant={variant}
      size={size}
      className={cn(
        "gap-1.5 border-violet-500/40 text-violet-200 hover:bg-violet-500/15 hover:text-violet-100",
        variant === "outline" && "bg-violet-500/5",
        className,
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {children}
    </Button>
  );
}
