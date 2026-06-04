import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkCheck, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getOemBySlug, listArticles, listBookmarks, toggleBookmark, articleTypeLabel } from "@/lib/kb";

export const Route = createFileRoute("/_authenticated/kb/$category")({
  component: KbCategory,
});

function KbCategory() {
  const { category } = useParams({ from: "/_authenticated/kb/$category" });
  const { user, isStaff } = useAuth();
  const qc = useQueryClient();

  const { data: oem } = useQuery({ queryKey: ["kb-oem", category], queryFn: () => getOemBySlug(category) });
  const { data: articles = [] } = useQuery({
    queryKey: ["kb-articles", oem?.id, isStaff],
    enabled: !!oem?.id,
    queryFn: () => listArticles({ oemId: oem!.id, publishedOnly: !isStaff }),
  });
  const { data: bookmarkIds = [] } = useQuery({
    queryKey: ["kb-bookmarks", user?.id],
    enabled: !!user?.id,
    queryFn: () => listBookmarks(user!.id),
  });

  if (!oem) return <div className="container py-10">Loading…</div>;

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <Link to="/kb" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> All partners
      </Link>
      <div>
        <h1 className="text-3xl font-bold">{oem.name}</h1>
        {oem.description && <p className="text-muted-foreground">{oem.description}</p>}
      </div>

      {articles.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No articles yet.</Card>
      ) : (
        <div className="grid gap-3">
          {articles.map((a) => {
            const bm = bookmarkIds.includes(a.id);
            return (
              <Card key={a.id} className="p-4 flex items-start justify-between gap-3 hover:border-primary transition">
                <Link to="/kb/article/$id" params={{ id: a.id }} className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{a.title}</span>
                    <Badge variant="secondary" className="text-xs">{articleTypeLabel(a.article_type)}</Badge>
                    {!a.published && <Badge variant="outline" className="text-xs">Draft</Badge>}
                  </div>
                  {a.summary && <p className="text-sm text-muted-foreground line-clamp-2">{a.summary}</p>}
                  <div className="text-xs text-muted-foreground mt-2">Updated {new Date(a.updated_at).toLocaleDateString()}</div>
                </Link>
                {user && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      await toggleBookmark(user.id, a.id, bm);
                      qc.invalidateQueries({ queryKey: ["kb-bookmarks", user.id] });
                    }}
                    aria-label={bm ? "Remove bookmark" : "Add bookmark"}
                  >
                    {bm ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <Bookmark className="h-4 w-4" />}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
