import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bookmark, BookmarkCheck, Share2, Download, History, FileText } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  getArticle,
  listArticles,
  listBookmarks,
  listVersions,
  toggleBookmark,
  attachmentUrl,
  cacheArticle,
  getCachedArticle,
  articleTypeLabel,
  type KbArticle,
} from "@/lib/kb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/kb/article/$id")({
  component: KbArticleDetail,
});

function KbArticleDetail() {
  const { id } = useParams({ from: "/_authenticated/kb/article/$id" });
  const { user } = useAuth();
  const qc = useQueryClient();
  const [offlineArticle, setOfflineArticle] = useState<KbArticle | null>(null);

  const { data: article, isLoading, error } = useQuery({
    queryKey: ["kb-article", id],
    queryFn: () => getArticle(id),
    retry: 0,
  });
  const { data: bookmarkIds = [] } = useQuery({
    queryKey: ["kb-bookmarks", user?.id],
    enabled: !!user?.id,
    queryFn: () => listBookmarks(user!.id),
  });
  const { data: related = [] } = useQuery({
    queryKey: ["kb-related", article?.oem_id, id],
    enabled: !!article?.oem_id,
    queryFn: async () => {
      const list = await listArticles({ oemId: article!.oem_id!, publishedOnly: true, limit: 8 });
      return list.filter((a) => a.id !== id);
    },
  });
  const { data: versions = [] } = useQuery({
    queryKey: ["kb-versions", id],
    queryFn: () => listVersions(id),
  });

  useEffect(() => {
    if (article) cacheArticle(article);
    else if (!isLoading && error) setOfflineArticle(getCachedArticle(id));
  }, [article, isLoading, error, id]);

  const current = article ?? offlineArticle;
  if (isLoading) return <div className="container py-10">Loading…</div>;
  if (!current) return <div className="container py-10">Article not found.</div>;

  const bm = bookmarkIds.includes(current.id);

  return (
    <div className="container max-w-6xl py-8">
      <Link to="/kb" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Knowledge base
      </Link>

      <div className="grid lg:grid-cols-[1fr_280px] gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant="secondary">{articleTypeLabel(current.article_type)}</Badge>
            {current.tags?.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
            {!current.published && <Badge variant="outline">Draft</Badge>}
            {offlineArticle && <Badge variant="outline">Offline copy</Badge>}
          </div>
          <h1 className="text-3xl font-bold">{current.title}</h1>
          {current.summary && <p className="text-muted-foreground mt-2">{current.summary}</p>}
          <div className="text-xs text-muted-foreground mt-2">
            Version {current.version} · Updated {new Date(current.updated_at).toLocaleString()}
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {user && (
              <Button
                variant={bm ? "default" : "outline"}
                size="sm"
                onClick={async () => {
                  await toggleBookmark(user.id, current.id, bm);
                  qc.invalidateQueries({ queryKey: ["kb-bookmarks", user.id] });
                  toast.success(bm ? "Bookmark removed" : "Bookmarked");
                }}
              >
                {bm ? <BookmarkCheck className="h-4 w-4 mr-1" /> : <Bookmark className="h-4 w-4 mr-1" />}
                {bm ? "Bookmarked" : "Bookmark"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success("Link copied");
              }}
            >
              <Share2 className="h-4 w-4 mr-1" /> Share
            </Button>
            {versions.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <History className="h-4 w-4 mr-1" /> Version history
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  {versions.map((v) => (
                    <DropdownMenuItem key={v.id} className="flex justify-between">
                      <span>v{v.version} — {v.title}</span>
                      <span className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleDateString()}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <Card className="p-6 mt-4">
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: current.content_html || "<p>No content.</p>" }}
            />
          </Card>

          {current.attachments?.length > 0 && (
            <Card className="p-4 mt-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2"><FileText className="h-4 w-4" /> Attachments</h3>
              <div className="space-y-2">
                {current.attachments.map((att) => (
                  <Button
                    key={att.path}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={async () => {
                      const url = await attachmentUrl(att.path);
                      if (url) window.open(url, "_blank");
                      else toast.error("Could not generate download link");
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {att.name}
                  </Button>
                ))}
              </div>
            </Card>
          )}
        </div>

        <aside className="space-y-3">
          <h3 className="font-semibold text-sm">Related articles</h3>
          {related.length === 0 ? (
            <p className="text-sm text-muted-foreground">No related articles.</p>
          ) : (
            related.map((r) => (
              <Link key={r.id} to="/kb/article/$id" params={{ id: r.id }}>
                <Card className="p-3 hover:border-primary transition">
                  <div className="text-sm font-medium line-clamp-2">{r.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{articleTypeLabel(r.article_type)}</div>
                </Card>
              </Link>
            ))
          )}
        </aside>
      </div>
    </div>
  );
}
