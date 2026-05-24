import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMeetingsStore } from "@/lib/meetings/storage";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Meeting, Priority } from "@/lib/meetings/types";

const priorityCls: Record<Priority, string> = {
  high: "text-red-400 border-red-500/40 bg-red-500/10",
  medium: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  low: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
};
const priorityEmoji: Record<Priority, string> = { high: "🔴", medium: "🟡", low: "🟢" };

export function ActionItemsTable({ meeting }: { meeting: Meeting }) {
  const { toggleActionItem } = useMeetingsStore();
  const p = meeting.processed!;
  const done = p.actionItems.filter((a) => a.done).length;

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur">
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Action Items</h3>
            <Badge variant="secondary">{done}/{p.actionItems.length} done</Badge>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Done</TableHead>
                <TableHead>Task</TableHead>
                <TableHead className="w-32">Owner</TableHead>
                <TableHead className="w-40">Deadline</TableHead>
                <TableHead className="w-28">Priority</TableHead>
                <TableHead className="w-32 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.actionItems.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Checkbox checked={a.done} onCheckedChange={() => toggleActionItem(meeting.id, a.id)} />
                  </TableCell>
                  <TableCell className={cn(a.done && "text-muted-foreground line-through")}>{a.task}</TableCell>
                  <TableCell className="text-sm">{a.owner}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{a.deadline}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs", priorityCls[a.priority])}>
                      {priorityEmoji[a.priority]} {a.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => toast.success(`Added "${a.task}" to your tasks`)}>
                      <Plus className="mr-1 h-3 w-3" /> My Tasks
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {p.actionItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No action items extracted.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
