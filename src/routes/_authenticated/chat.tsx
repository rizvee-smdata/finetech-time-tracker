import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  ensureDefaultChannels,
  loadChannels,
  loadMessages,
  loadReactions,
  loadCompanyProfiles,
  sendMessage,
  toggleReaction,
  pinMessage,
  getOrCreateDM,
  formatStamp,
  extractMentions,
  type ChatChannel,
  type ChatMessage,
  type ChatReaction,
  type ProfileLite,
} from "@/lib/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Send, Smile, Paperclip, Pin, Hash, Megaphone, Trophy, Users, Search, Plus, X } from "lucide-react";

const REACTION_EMOJIS = ["👍", "❤️", "🎉", "👏", "🔥", "😂", "🙏", "💯"];

const searchSchema = z.object({
  channel: z.string().optional(),
  dm: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/chat")({
  validateSearch: searchSchema,
  component: ChatPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-destructive">
      Chat failed to load: {error.message}
    </div>
  ),
});

function initials(name: string | null | undefined, email?: string | null) {
  const src = name?.trim() || email?.split("@")[0] || "?";
  return src.split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
}

function ChatPage() {
  const { user, companyId, isStaff } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/chat" });

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [search_, setSearch_] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const profilesById = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  // ---------- Initial load ----------
  useEffect(() => {
    if (!companyId || !user) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureDefaultChannels(companyId, user.id);
        const [chs, profs] = await Promise.all([
          loadChannels(companyId),
          loadCompanyProfiles(companyId),
        ]);
        if (cancelled) return;
        setChannels(chs);
        setProfiles(profs);

        // Resolve active channel
        let target: string | null = null;
        if (search.channel) {
          target = chs.find((c) => c.slug === search.channel || c.id === search.channel)?.id ?? null;
        }
        if (!target && search.dm) {
          const dm = await getOrCreateDM(companyId, user.id, search.dm);
          setChannels((prev) => (prev.find((c) => c.id === dm.id) ? prev : [...prev, dm]));
          target = dm.id;
        }
        if (!target) {
          target = chs.find((c) => c.slug === "general")?.id ?? chs[0]?.id ?? null;
        }
        setActiveChannelId(target);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load chat");
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, user?.id, search.channel, search.dm]);

  // ---------- Load messages on channel change ----------
  useEffect(() => {
    if (!activeChannelId) return;
    let cancelled = false;
    (async () => {
      try {
        const [msgs, reacts] = await Promise.all([
          loadMessages(activeChannelId),
          loadReactions(activeChannelId),
        ]);
        if (cancelled) return;
        setMessages(msgs);
        setReactions(reacts);
        setUnread((u) => ({ ...u, [activeChannelId]: 0 }));
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, [activeChannelId]);

  // ---------- Realtime: messages + reactions (global) ----------
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`chat-realtime-${companyId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const m = payload.new as ChatMessage;
        if (m.company_id !== companyId) return;
        if (m.channel_id === activeChannelId) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        } else {
          setUnread((u) => ({ ...u, [m.channel_id]: (u[m.channel_id] ?? 0) + 1 }));
          if (m.mentions?.includes(user?.id ?? "")) {
            toast.info(`Mentioned by ${profilesById.get(m.sender_id ?? "")?.full_name ?? "someone"}`);
          }
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_reactions" }, (payload) => {
        const r = payload.new as ChatReaction;
        setReactions((prev) => (prev.some((x) => x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji) ? prev : [...prev, r]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_reactions" }, (payload) => {
        const r = payload.old as ChatReaction;
        setReactions((prev) => prev.filter((x) => !(x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji)));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, (payload) => {
        const m = payload.new as ChatMessage;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, activeChannelId, user?.id, profilesById]);

  // ---------- Presence + typing (per channel) ----------
  useEffect(() => {
    if (!activeChannelId || !user) return;
    const presence = supabase.channel(`presence-${activeChannelId}`, {
      config: { presence: { key: user.id } },
    });
    presence
      .on("presence", { event: "sync" }, () => {
        const state = presence.presenceState();
        setOnlineUsers(new Set(Object.keys(state)));
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const uid = (payload as { user_id: string }).user_id;
        if (uid === user.id) return;
        setTypingUsers((t) => ({ ...t, [uid]: Date.now() }));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presence.track({ online_at: new Date().toISOString() });
        }
      });
    const cleanupInterval = window.setInterval(() => {
      setTypingUsers((t) => {
        const cutoff = Date.now() - 3500;
        const next: Record<string, number> = {};
        Object.entries(t).forEach(([k, v]) => { if (v > cutoff) next[k] = v; });
        return next;
      });
    }, 1500);
    return () => {
      window.clearInterval(cleanupInterval);
      supabase.removeChannel(presence);
    };
  }, [activeChannelId, user?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeChannelId]);

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const dmChannels = channels.filter((c) => c.kind === "dm");
  const roomChannels = channels.filter((c) => c.kind !== "dm");

  const dmPeerId = useCallback((c: ChatChannel) => {
    // requires members fetched; for sidebar label resolution, infer via separate fetch
    return c.created_by === user?.id ? null : c.created_by;
  }, [user?.id]);

  const switchChannel = (id: string) => {
    setActiveChannelId(id);
    const c = channels.find((x) => x.id === id);
    if (c?.kind === "dm") navigate({ to: "/chat", search: { dm: id } });
    else navigate({ to: "/chat", search: { channel: c?.slug ?? id } });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="border-b border-border p-3">
          <h2 className="text-lg font-semibold">Team Chat</h2>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search_}
              onChange={(e) => setSearch_(e.target.value)}
              placeholder="Search teammates"
              className="pl-8 h-8"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channels</div>
            {roomChannels.map((c) => {
              const Icon = c.is_announcement ? Megaphone : c.slug === "sales-wins" ? Trophy : Hash;
              return (
                <button
                  key={c.id}
                  onClick={() => switchChannel(c.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                    activeChannelId === c.id && "bg-accent font-medium",
                  )}
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{c.name}</span>
                  {unread[c.id] ? (
                    <Badge variant="default" className="h-5 px-1.5 text-[10px]">{unread[c.id]}</Badge>
                  ) : null}
                </button>
              );
            })}

            <div className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Direct Messages</div>
            {dmChannels.length === 0 && (
              <div className="px-2 py-1 text-xs text-muted-foreground">Pick a teammate below</div>
            )}
            {dmChannels.map((c) => {
              const peer = dmPeerId(c);
              const p = peer ? profilesById.get(peer) : null;
              const label = p?.full_name || p?.email || "Direct Message";
              return (
                <button
                  key={c.id}
                  onClick={() => switchChannel(c.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                    activeChannelId === c.id && "bg-accent font-medium",
                  )}
                >
                  <div className="relative">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">{initials(p?.full_name, p?.email)}</AvatarFallback>
                    </Avatar>
                    {peer && onlineUsers.has(peer) && (
                      <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-card" />
                    )}
                  </div>
                  <span className="flex-1 truncate">{label}</span>
                  {unread[c.id] ? (
                    <Badge variant="default" className="h-5 px-1.5 text-[10px]">{unread[c.id]}</Badge>
                  ) : null}
                </button>
              );
            })}

            <div className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Teammates</div>
            {profiles
              .filter((p) => p.id !== user?.id)
              .filter((p) => !search_ || (p.full_name ?? p.email ?? "").toLowerCase().includes(search_.toLowerCase()))
              .map((p) => (
                <button
                  key={p.id}
                  onClick={async () => {
                    if (!companyId || !user) return;
                    const dm = await getOrCreateDM(companyId, user.id, p.id);
                    setChannels((prev) => (prev.find((c) => c.id === dm.id) ? prev : [...prev, dm]));
                    switchChannel(dm.id);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <div className="relative">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">{initials(p.full_name, p.email)}</AvatarFallback>
                    </Avatar>
                    {onlineUsers.has(p.id) && (
                      <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-card" />
                    )}
                  </div>
                  <span className="flex-1 truncate">{p.full_name || p.email}</span>
                  <Plus className="h-3 w-3 text-muted-foreground" />
                </button>
              ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Main panel */}
      <main className="flex flex-1 flex-col">
        {activeChannel ? (
          <ChannelView
            channel={activeChannel}
            messages={messages}
            reactions={reactions}
            profiles={profilesById}
            onlineUsers={onlineUsers}
            typingUsers={typingUsers}
            currentUserId={user?.id ?? ""}
            companyId={companyId ?? ""}
            isStaff={isStaff}
            allProfiles={profiles}
            messagesEndRef={messagesEndRef}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            Select a channel to start chatting
          </div>
        )}
      </main>
    </div>
  );
}

function ChannelView(props: {
  channel: ChatChannel;
  messages: ChatMessage[];
  reactions: ChatReaction[];
  profiles: Map<string, ProfileLite>;
  onlineUsers: Set<string>;
  typingUsers: Record<string, number>;
  currentUserId: string;
  companyId: string;
  isStaff: boolean;
  allProfiles: ProfileLite[];
  messagesEndRef: React.RefObject<HTMLDivElement>;
}) {
  const { channel, messages, reactions, profiles, typingUsers, currentUserId, companyId, isStaff, allProfiles, messagesEndRef } = props;

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const announcementBlocked = channel.is_announcement && !isStaff;

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending || announcementBlocked) return;
    if (body.length > 2000) {
      toast.error("Message exceeds 2000 characters");
      return;
    }
    setSending(true);
    try {
      const mentions = extractMentions(body, allProfiles);
      await sendMessage({
        channelId: channel.id,
        companyId,
        senderId: currentUserId,
        body,
        mentions,
      });
      setDraft("");
    } catch (e) {
      console.error(e);
      toast.error("Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const broadcastTyping = useCallback(() => {
    const ch = supabase.channel(`presence-${channel.id}`);
    ch.send({ type: "broadcast", event: "typing", payload: { user_id: currentUserId } });
  }, [channel.id, currentUserId]);

  useEffect(() => {
    if (!draft) return;
    const t = window.setTimeout(broadcastTyping, 300);
    return () => window.clearTimeout(t);
  }, [draft, broadcastTyping]);

  // mention autocomplete trigger
  const handleDraftChange = (v: string) => {
    setDraft(v);
    const cursor = textareaRef.current?.selectionStart ?? v.length;
    const upto = v.slice(0, cursor);
    const m = upto.match(/@([\w.\- ]{0,30})$/);
    if (m) {
      setMentionOpen(true);
      setMentionQuery(m[1].toLowerCase());
    } else {
      setMentionOpen(false);
    }
  };

  const mentionCandidates = useMemo(() => {
    return allProfiles
      .filter((p) => p.id !== currentUserId)
      .filter((p) =>
        !mentionQuery ||
        (p.full_name ?? "").toLowerCase().includes(mentionQuery) ||
        (p.email ?? "").toLowerCase().includes(mentionQuery),
      )
      .slice(0, 5);
  }, [allProfiles, mentionQuery, currentUserId]);

  const insertMention = (p: ProfileLite) => {
    const v = draft;
    const cursor = textareaRef.current?.selectionStart ?? v.length;
    const upto = v.slice(0, cursor);
    const after = v.slice(cursor);
    const replaced = upto.replace(/@([\w.\- ]{0,30})$/, `@${p.full_name ?? p.email ?? ""} `);
    setDraft(replaced + after);
    setMentionOpen(false);
    textareaRef.current?.focus();
  };

  // Reactions grouped per message
  const reactionMap = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>();
    reactions.forEach((r) => {
      const m = map.get(r.message_id) ?? new Map();
      const arr = m.get(r.emoji) ?? [];
      arr.push(r.user_id);
      m.set(r.emoji, arr);
      map.set(r.message_id, m);
    });
    return map;
  }, [reactions]);

  // Unread divider position: first message after a chosen marker — for v1 we skip persistence and just show no divider
  // (channel switch already resets unread count via parent)

  // Group by day
  const grouped = useMemo(() => {
    const groups: Array<{ label: string; items: ChatMessage[] }> = [];
    messages.forEach((m) => {
      const d = new Date(m.created_at);
      const today = new Date();
      const yest = new Date(); yest.setDate(today.getDate() - 1);
      const label =
        d.toDateString() === today.toDateString() ? "Today"
        : d.toDateString() === yest.toDateString() ? "Yesterday"
        : d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(m);
      else groups.push({ label, items: [m] });
    });
    return groups;
  }, [messages]);

  const typingNames = Object.keys(typingUsers)
    .map((id) => profiles.get(id)?.full_name?.split(" ")[0] ?? "Someone")
    .slice(0, 2);

  const pinned = messages.filter((m) => m.is_pinned).slice(0, 3);

  const HeaderIcon = channel.is_announcement ? Megaphone : channel.slug === "sales-wins" ? Trophy : channel.kind === "dm" ? Users : Hash;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <HeaderIcon className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-base font-semibold leading-tight">{channel.name}</h3>
            {channel.topic && <p className="text-xs text-muted-foreground">{channel.topic}</p>}
          </div>
          {channel.is_announcement && (
            <Badge variant="secondary" className="ml-2">Announcements · managers only</Badge>
          )}
        </div>
      </header>

      {/* Pinned */}
      {pinned.length > 0 && (
        <div className="border-b border-border bg-muted/40 px-4 py-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Pin className="h-3 w-3" /> Pinned
          </div>
          <div className="mt-1 space-y-1">
            {pinned.map((m) => (
              <div key={m.id} className="truncate text-xs">{m.body}</div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 px-3 py-4 md:px-6">
          {grouped.map((g) => (
            <div key={g.label} className="space-y-3">
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs font-medium text-muted-foreground">{g.label}</span>
                <Separator className="flex-1" />
              </div>
              {g.items.map((m) => {
                const sender = m.sender_id ? profiles.get(m.sender_id) : null;
                const mine = m.sender_id === currentUserId;
                const reacts = reactionMap.get(m.id);
                if (channel.is_announcement) {
                  return (
                    <div key={m.id} className="rounded-lg border-l-4 border-primary bg-card p-4 shadow-sm">
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{sender?.full_name ?? "Manager"}</span>
                        <span>{formatStamp(m.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className={cn("flex gap-2", mine ? "justify-end" : "justify-start")}>
                    {!mine && (
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="text-xs">{initials(sender?.full_name, sender?.email)}</AvatarFallback>
                      </Avatar>
                    )}
                    <div className={cn("max-w-[78%] space-y-1", mine && "items-end")}>
                      <div className={cn("flex items-baseline gap-2 text-xs", mine && "flex-row-reverse")}>
                        <span className="font-medium text-foreground">{mine ? "You" : (sender?.full_name ?? "Unknown")}</span>
                        <span className="text-muted-foreground">{formatStamp(m.created_at)}</span>
                        {m.is_pinned && <Pin className="h-3 w-3 text-primary" />}
                      </div>
                      <div
                        className={cn(
                          "rounded-2xl px-3 py-2 text-sm shadow-sm whitespace-pre-wrap break-words",
                          mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm",
                          m.is_system && "italic",
                        )}
                      >
                        {m.body}
                      </div>
                      <div className={cn("flex flex-wrap items-center gap-1", mine && "justify-end")}>
                        {reacts && Array.from(reacts.entries()).map(([emoji, users]) => {
                          const has = users.includes(currentUserId);
                          return (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(m.id, currentUserId, emoji, !has).catch(console.error)}
                              className={cn(
                                "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition",
                                has ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent",
                              )}
                            >
                              <span>{emoji}</span>
                              <span className="text-muted-foreground">{users.length}</span>
                            </button>
                          );
                        })}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="rounded-full border border-transparent px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent">
                              <Smile className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-1" align={mine ? "end" : "start"}>
                            <div className="flex gap-1">
                              {REACTION_EMOJIS.map((e) => (
                                <button
                                  key={e}
                                  onClick={() => toggleReaction(m.id, currentUserId, e, true).catch(console.error)}
                                  className="rounded p-1 text-base hover:bg-accent"
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        {isStaff && (
                          <button
                            onClick={() => pinMessage(m.id, !m.is_pinned).catch(console.error)}
                            className="rounded-full px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                            title={m.is_pinned ? "Unpin" : "Pin"}
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {messages.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No messages yet — say hi!
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Typing */}
      <div className="px-4 pb-1 text-xs italic text-muted-foreground h-5">
        {typingNames.length > 0 && `${typingNames.join(", ")} ${typingNames.length === 1 ? "is" : "are"} typing...`}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-card p-3">
        {announcementBlocked ? (
          <div className="rounded-md bg-muted px-4 py-3 text-center text-sm text-muted-foreground">
            Only managers can post in announcements.
          </div>
        ) : (
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={handleKey}
              placeholder={`Message ${channel.kind === "dm" ? "" : "#"}${channel.name}`}
              className="min-h-[60px] resize-none pr-28"
              maxLength={2000}
            />
            {mentionOpen && mentionCandidates.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-64 rounded-md border border-border bg-popover p-1 shadow-lg">
                {mentionCandidates.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => insertMention(p)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <Avatar className="h-5 w-5"><AvatarFallback className="text-[10px]">{initials(p.full_name, p.email)}</AvatarFallback></Avatar>
                    <span className="flex-1 truncate">{p.full_name || p.email}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const path = `${channel.id}/${Date.now()}-${file.name}`;
                  const { error: upErr } = await supabase.storage
                    .from("chat-attachments")
                    .upload(path, file);
                  if (upErr) { toast.error(upErr.message); return; }
                  await sendMessage({
                    channelId: channel.id,
                    companyId,
                    senderId: currentUserId,
                    body: `📎 ${file.name}`,
                    attachments: [{ name: file.name, path, size: file.size, type: file.type }],
                  });
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => fileInputRef.current?.click()}
                title="Attach file"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="Emoji">
                    <Smile className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="end">
                  <div className="grid grid-cols-8 gap-1">
                    {["😀","😃","😄","😁","😅","😂","🤣","🙂","😉","😊","😍","🤩","🤔","😎","🙏","👏","👍","👎","❤️","🔥","🎉","💯","🚀","💪","✨","👋","💼","📈","📊","🤝","🙌","🥳"].map((e) => (
                      <button
                        key={e}
                        onClick={() => setDraft((d) => d + e)}
                        className="rounded p-1 text-lg hover:bg-accent"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button size="sm" onClick={handleSend} disabled={sending || !draft.trim()} className="h-8">
                <Send className="mr-1 h-3.5 w-3.5" /> Send
              </Button>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Enter to send · Shift+Enter for new line</span>
              <span className={cn(draft.length > 1900 && "text-destructive")}>{draft.length}/2000</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
