import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Search, BookOpen, Bookmark, Sparkles, Clock, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  listOems,
  listArticles,
  listBookmarks,
  searchArticles,
  articleTypeLabel,
  getCachedArticles,
  type KbSearchHit,
} from "@/lib/kb";

export const Route = createFileRoute("/_authenticated/kb/")({
  component: KbHome,
});

function KbHome() {
  const { user, isStaff } = useAuth();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<KbSearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const { data: oems = [] } = useQuery({ queryKey: ["kb-oems"], queryFn: listOems });
  const { data: recent = [] } = useQuery({
    queryKey: ["kb-recent"],
    queryFn: () => listArticles({ publishedOnly: !isStaff, limit: 8 }),
  });
  const { data: bookmarkIds = [] } = useQuery({
    queryKey: ["kb-bookmarks", user?.id],
    enabled: !!user?.id,
    queryFn: () => listBookmarks(user!.id),
  });
  const { data: bookmarked = [] } = useQuery({
    queryKey: ["kb-bookmarked-articles", bookmarkIds.join(",")],
    enabled: bookmarkIds.length > 0,
    queryFn: async () => {
      const list = await listArticles({ publishedOnly: false, limit: 50 });
      return list.filter((a) => bookmarkIds.includes(a.id));
    },
  });

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setHits([]); return; }
      setSearching(true);
      const r = await searchArticles(q, 8);
      setHits(r);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const oemBySlug = useMemo(() => {
    const m = new Map<string, { slug: string; name: string }>();
    oems.forEach((o) => m.set(o.id, { slug: o.slug, name: o.name }));
    return m;
  }, [oems]);
  const cached = typeof window !== "undefined" ? getCachedArticles() : [];

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <BookOpen className="h-7 w-7 text-primary" /> Knowledge Base
            </h1>
            <p className="text-muted-foreground">SmartData product info, pricing, battlecards & FAQs</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link to="/kb/ask"><Sparkles className="h-4 w-4 mr-1" /> Ask AI</Link></Button>
            {isStaff && <Button asChild><Link to="/kb/admin">Manage</Link></Button>}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search articles, products, OEMs, tags…"
            className="pl-10 h-12 text-base"
          />
          {hits.length > 0 && (
            <Card className="absolute z-20 mt-2 w-full max-h-96 overflow-auto divide-y">
              {hits.map((h) => (
                <Link
                  key={h.id}
                  to="/kb/article/$id"
                  params={{ id: h.id }}
                  onClick={() => { setQ(""); setHits([]); }}
                  className="block p-3 hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{h.title}</span>
                    <Badge variant="secondary" className="text-xs">{articleTypeLabel(h.article_type)}</Badge>
                  </div>
                  {h.summary && <p className="text-sm text-muted-foreground line-clamp-1">{h.summary}</p>}
                  {h.oem_name && <p className="text-xs text-muted-foreground mt-1">{h.oem_name}</p>}
                </Link>
              ))}
              {searching && <div className="p-3 text-sm text-muted-foreground">Searching…</div>}
            </Card>
          )}
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">OEM Partners</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {oems.map((o) => (
            <Link key={o.id} to="/kb/$category" params={{ category: o.slug }}>
              <Card className="p-4 h-full hover:border-primary hover:shadow-sm transition cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold">{o.name}</div>
                    {o.description && <div className="text-xs text-muted-foreground line-clamp-2">{o.description}</div>}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" /> Recently updated
        </h2>
        {recent.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">No articles yet.</Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {recent.map((a) => (
              <Link key={a.id} to="/kb/article/$id" params={{ id: a.id }}>
                <Card className="p-4 hover:border-primary hover:shadow-sm transition">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{a.title}</div>
                    <Badge variant="secondary" className="text-xs">{articleTypeLabel(a.article_type)}</Badge>
                  </div>
                  {a.summary && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{a.summary}</p>}
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span>{a.oem_id ? oemBySlug.get(a.oem_id)?.name ?? "" : ""}</span>
                    <span>Updated {new Date(a.updated_at).toLocaleDateString()}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {bookmarked.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Bookmark className="h-4 w-4" /> Your bookmarks
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {bookmarked.map((a) => (
              <Link key={a.id} to="/kb/article/$id" params={{ id: a.id }}>
                <Card className="p-4 hover:border-primary transition">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{articleTypeLabel(a.article_type)}</div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {cached.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 text-muted-foreground">Recently viewed (offline)</h2>
          <div className="flex flex-wrap gap-2">
            {cached.slice(0, 10).map((a) => (
              <Link key={a.id} to="/kb/article/$id" params={{ id: a.id }}>
                <Badge variant="outline" className="cursor-pointer">{a.title}</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
