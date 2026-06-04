import { supabase } from "@/integrations/supabase/client";

export type KbOem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  sort_order: number;
};

export type KbArticle = {
  id: string;
  oem_id: string | null;
  title: string;
  slug: string | null;
  article_type: string;
  summary: string | null;
  content_html: string;
  content_text: string;
  tags: string[];
  attachments: Array<{ name: string; path: string; size?: number; mime?: string }>;
  version: number;
  published: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
};

export type KbSearchHit = {
  id: string;
  title: string;
  summary: string | null;
  article_type: string;
  oem_id: string | null;
  oem_name: string | null;
  oem_slug: string | null;
  updated_at: string;
  rank: number;
};

export const ARTICLE_TYPES = [
  { value: "product_spec", label: "Product Spec" },
  { value: "pricing", label: "Pricing" },
  { value: "battlecard", label: "Battlecard" },
  { value: "faq", label: "FAQ" },
  { value: "case_study", label: "Case Study" },
  { value: "brochure", label: "Brochure" },
  { value: "other", label: "Other" },
];

export function articleTypeLabel(t: string) {
  return ARTICLE_TYPES.find((x) => x.value === t)?.label ?? t;
}

export function stripHtml(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ");
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent ?? d.innerText ?? "").replace(/\s+/g, " ").trim();
}

export async function listOems(): Promise<KbOem[]> {
  const { data } = await supabase.from("kb_oems" as never).select("*").order("sort_order");
  return (data as unknown as KbOem[]) ?? [];
}

export async function getOemBySlug(slug: string): Promise<KbOem | null> {
  const { data } = await supabase.from("kb_oems" as never).select("*").eq("slug", slug).maybeSingle();
  return (data as unknown as KbOem) ?? null;
}

export async function listArticles(opts: { oemId?: string; publishedOnly?: boolean; limit?: number } = {}) {
  let q = supabase
    .from("kb_articles" as never)
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.oemId) q = q.eq("oem_id", opts.oemId);
  if (opts.publishedOnly) q = q.eq("published", true);
  const { data } = await q;
  return ((data as unknown as KbArticle[]) ?? []);
}

export async function getArticle(id: string): Promise<KbArticle | null> {
  const { data } = await supabase.from("kb_articles" as never).select("*").eq("id", id).maybeSingle();
  return (data as unknown as KbArticle) ?? null;
}

export async function searchArticles(q: string, limit = 10): Promise<KbSearchHit[]> {
  const query = q.trim();
  if (!query) return [];
  const { data, error } = await (supabase.rpc as unknown as (fn: string, args: unknown) => Promise<{ data: unknown; error: unknown }>)(
    "kb_search",
    { _q: query, _limit: limit },
  );
  if (error) return [];
  return (data as unknown as KbSearchHit[]) ?? [];
}

export async function listBookmarks(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("kb_bookmarks" as never)
    .select("article_id")
    .eq("user_id", userId);
  return ((data as unknown as Array<{ article_id: string }>) ?? []).map((b) => b.article_id);
}

export async function toggleBookmark(userId: string, articleId: string, bookmarked: boolean) {
  if (bookmarked) {
    await supabase.from("kb_bookmarks" as never).delete().eq("user_id", userId).eq("article_id", articleId);
  } else {
    await supabase.from("kb_bookmarks" as never).insert({ user_id: userId, article_id: articleId } as never);
  }
}

export async function listVersions(articleId: string) {
  const { data } = await supabase
    .from("kb_article_versions" as never)
    .select("*")
    .eq("article_id", articleId)
    .order("version", { ascending: false });
  return (data as unknown as Array<{ id: string; version: number; title: string; content_html: string; created_at: string }>) ?? [];
}

export async function askKb(question: string): Promise<{ answer: string; sources: Array<{ id: string; title: string; oem_name: string | null }> }> {
  const { data, error } = await supabase.functions.invoke("generate-kb-answer", { body: { question } });
  if (error) throw error;
  return data as { answer: string; sources: Array<{ id: string; title: string; oem_name: string | null }> };
}

// --- Attachments ---

export async function uploadAttachment(file: File, articleId: string) {
  const path = `${articleId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage.from("kb-attachments").upload(path, file, { upsert: false });
  if (error) throw error;
  return { name: file.name, path, size: file.size, mime: file.type };
}

export async function attachmentUrl(path: string) {
  const { data } = await supabase.storage.from("kb-attachments").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

// --- Offline cache: last 20 viewed articles ---

const CACHE_KEY = "kb:recent-articles";
const CACHE_MAX = 20;

type CachedArticle = KbArticle & { oem_name?: string | null; cached_at: number };

export function cacheArticle(article: KbArticle, oemName?: string | null) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const list: CachedArticle[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((a) => a.id !== article.id);
    filtered.unshift({ ...article, oem_name: oemName ?? null, cached_at: Date.now() });
    localStorage.setItem(CACHE_KEY, JSON.stringify(filtered.slice(0, CACHE_MAX)));
  } catch { /* ignore quota */ }
}

export function getCachedArticle(id: string): CachedArticle | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const list: CachedArticle[] = JSON.parse(raw);
    return list.find((a) => a.id === id) ?? null;
  } catch { return null; }
}

export function getCachedArticles(): CachedArticle[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
