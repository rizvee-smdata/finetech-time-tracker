import { supabase } from "@/integrations/supabase/client";

export type ChatChannelKind = "channel" | "dm" | "system";

export interface ChatChannel {
  id: string;
  company_id: string;
  name: string;
  slug: string | null;
  kind: ChatChannelKind;
  is_announcement: boolean;
  is_system: boolean;
  topic: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  company_id: string;
  sender_id: string | null;
  body: string;
  attachments: Array<{ name: string; path: string; size?: number; type?: string }>;
  mentions: string[];
  parent_id: string | null;
  is_pinned: boolean;
  is_system: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ChatReaction {
  message_id: string;
  user_id: string;
  emoji: string;
}

export interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url?: string | null;
}

export async function ensureDefaultChannels(companyId: string, actorId: string) {
  await supabase.rpc("chat_ensure_default_channels", {
    _company: companyId,
    _actor: actorId,
  });
}

export async function loadChannels(companyId: string): Promise<ChatChannel[]> {
  const { data, error } = await supabase
    .from("chat_channels")
    .select("*")
    .eq("company_id", companyId)
    .order("kind")
    .order("name");
  if (error) throw error;
  return (data ?? []) as ChatChannel[];
}

export async function loadMessages(channelId: string, limit = 100): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as ChatMessage[]).reverse();
}

export async function loadReactions(channelId: string): Promise<ChatReaction[]> {
  // Pull recent reactions for messages in the channel
  const { data: msgs } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const ids = (msgs ?? []).map((m) => m.id);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("chat_reactions")
    .select("*")
    .in("message_id", ids);
  if (error) throw error;
  return (data ?? []) as ChatReaction[];
}

export async function sendMessage(args: {
  channelId: string;
  companyId: string;
  senderId: string;
  body: string;
  mentions?: string[];
  parentId?: string | null;
  attachments?: ChatMessage["attachments"];
}) {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      channel_id: args.channelId,
      company_id: args.companyId,
      sender_id: args.senderId,
      body: args.body,
      mentions: args.mentions ?? [],
      parent_id: args.parentId ?? null,
      attachments: args.attachments ?? [],
    })
    .select()
    .single();
  if (error) throw error;
  return data as ChatMessage;
}

export async function toggleReaction(messageId: string, userId: string, emoji: string, on: boolean) {
  if (on) {
    const { error } = await supabase
      .from("chat_reactions")
      .insert({ message_id: messageId, user_id: userId, emoji });
    if (error && error.code !== "23505") throw error;
  } else {
    const { error } = await supabase
      .from("chat_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .eq("emoji", emoji);
    if (error) throw error;
  }
}

export async function pinMessage(id: string, pinned: boolean) {
  const { error } = await supabase
    .from("chat_messages")
    .update({ is_pinned: pinned })
    .eq("id", id);
  if (error) throw error;
}

export async function loadCompanyProfiles(companyId: string): Promise<ProfileLite[]> {
  const { data: members, error: e1 } = await supabase
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId);
  if (e1) throw e1;
  const ids = (members ?? []).map((m) => m.user_id);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as ProfileLite[];
}

/** Get-or-create a 1:1 DM channel between two users */
export async function getOrCreateDM(companyId: string, me: string, other: string): Promise<ChatChannel> {
  // find candidates: dm channels where both are members
  const { data: candidateMembers, error: e0 } = await supabase
    .from("chat_channel_members")
    .select("channel_id")
    .eq("user_id", me);
  if (e0) throw e0;
  const myChannels = (candidateMembers ?? []).map((r) => r.channel_id);

  if (myChannels.length) {
    const { data: dms } = await supabase
      .from("chat_channels")
      .select("*")
      .eq("company_id", companyId)
      .eq("kind", "dm")
      .in("id", myChannels);
    for (const c of (dms ?? []) as ChatChannel[]) {
      const { data: mem } = await supabase
        .from("chat_channel_members")
        .select("user_id")
        .eq("channel_id", c.id);
      const ids = (mem ?? []).map((m) => m.user_id).sort();
      const want = [me, other].sort();
      if (ids.length === 2 && ids[0] === want[0] && ids[1] === want[1]) return c;
    }
  }

  // create
  const { data: ch, error } = await supabase
    .from("chat_channels")
    .insert({
      company_id: companyId,
      name: "Direct Message",
      kind: "dm",
      created_by: me,
    })
    .select()
    .single();
  if (error) throw error;
  await supabase.from("chat_channel_members").insert([
    { channel_id: ch.id, user_id: me },
    { channel_id: ch.id, user_id: other },
  ]);
  return ch as ChatChannel;
}

export function formatStamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today ${t}`;
  if (isYest) return `Yesterday ${t}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + t;
}

export function extractMentions(body: string, profiles: ProfileLite[]): string[] {
  const out: string[] = [];
  const re = /@([\w.\- ]{2,40})/g;
  let m;
  while ((m = re.exec(body))) {
    const q = m[1].trim().toLowerCase();
    const p = profiles.find(
      (pr) =>
        (pr.full_name ?? "").toLowerCase().startsWith(q) ||
        (pr.email ?? "").toLowerCase().startsWith(q),
    );
    if (p && !out.includes(p.id)) out.push(p.id);
  }
  return out;
}
