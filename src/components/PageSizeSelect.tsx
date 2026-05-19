import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE_OPTIONS = [20, 30, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export function usePagination<T>(items: T[], initialSize: PageSize = 20) {
  const [pageSize, setPageSize] = useState<PageSize>(initialSize);
  const [page, setPage] = useState(1);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const paged = useMemo(() => items.slice(start, end), [items, start, end]);

  function setSize(n: PageSize) {
    setPageSize(n);
    setPage(1);
  }

  return {
    paged,
    page: safePage,
    pageSize,
    pageCount,
    total,
    start,
    end,
    setPage,
    setPageSize: setSize,
  };
}

type Props = {
  pageSize: number;
  setPageSize: (n: PageSize) => void;
  page: number;
  pageCount: number;
  setPage: (n: number) => void;
  total: number;
  start: number;
  end: number;
  label?: string;
  className?: string;
};

export function PaginationBar({
  pageSize,
  setPageSize,
  page,
  pageCount,
  setPage,
  total,
  start,
  end,
  label = "records",
  className,
}: Props) {
  if (total === 0) return null;
  return (
    <div
      className={
        "flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground " +
        (className ?? "")
      }
    >
      <div className="flex items-center gap-2">
        <span>Show</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => setPageSize(Number(v) as PageSize)}
        >
          <SelectTrigger className="h-8 w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>per page</span>
      </div>
      <div className="flex items-center gap-3">
        <span>
          {start + 1}–{end} of {total} {label}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2">
            {page} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
