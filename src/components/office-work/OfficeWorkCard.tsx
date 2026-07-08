import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatHm, formatHours, type OfficeWorkLog, type WorkCategory } from "@/lib/officeWork/api";

export function OfficeWorkCard({
  log, categories, showAuthor, canEdit, onEdit, onDelete,
}: {
  log: OfficeWorkLog;
  categories: WorkCategory[];
  showAuthor?: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const hasBlocked = log.tasks.some((t) => t.status === "blocked");
  const edited = new Date(log.updated_at).getTime() - new Date(log.created_at).getTime() > 10 * 60_000;

  return (
    <Card className={`p-5 ${hasBlocked ? "border-l-4 border-l-red-500" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Office work
            <Badge variant="secondary" className="ml-1">{formatHours(log.total_minutes)}</Badge>
            {edited && (
              <span className="text-[10px] text-muted-foreground border rounded px-1 py-0.5"
                title={`Last updated ${format(new Date(log.updated_at), "PPpp")}`}>edited</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(`${log.work_date}T12:00:00+06:00`), "EEE, MMM d, yyyy")}
            {showAuthor && log.author && <> · {log.author.full_name || log.author.email}</>}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={onEdit} title="Edit"><Pencil className="h-4 w-4" /></Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this day?</AlertDialogTitle>
                  <AlertDialogDescription>This will delete the day and all its tasks.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        {log.tasks.map((t) => {
          const cat = catMap.get(t.category_id);
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
              {cat && (
                <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                  style={{ backgroundColor: cat.color }}>{cat.name}</span>
              )}
              {t.project_name && <span className="text-muted-foreground">· {t.project_name}</span>}
              <span>· {t.description}</span>
              <span className="text-muted-foreground">· {formatHm(t.duration_minutes)}</span>
              {t.status === "blocked" && (
                <Badge variant="destructive" className="text-[10px]">Blocked</Badge>
              )}
              {t.status === "in_progress" && (
                <Badge variant="outline" className="text-[10px]">In progress</Badge>
              )}
            </div>
          );
        })}
      </div>

      {log.day_summary && (
        <p className="mt-3 text-sm italic text-muted-foreground">{log.day_summary}</p>
      )}
    </Card>
  );
}
