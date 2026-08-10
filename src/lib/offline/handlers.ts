import { supabase } from "@/integrations/supabase/client";
import { registerOutboxHandler, type OutboxItem } from "./queue";

const sb = supabase as any;

async function uploadMedia(userId: string, blob: Blob, ext: string): Promise<string> {
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const { error } = await supabase.storage.from("checkins-media").upload(path, blob, {
    contentType: blob.type || undefined,
  });
  if (error) throw new Error(error.message);
  return path;
}

let registered = false;

/** Registers replay handlers once per browser session. */
export function registerOfflineHandlers() {
  if (registered) return;
  registered = true;

  registerOutboxHandler("visit_checkin", async (item: OutboxItem) => {
    const row = { ...item.payload } as Record<string, any>;
    const userId = row.user_id as string;

    for (const media of item.media ?? []) {
      row[media.field] = await uploadMedia(userId, media.blob, media.ext);
    }

    // Close any still-open check-in for this user before inserting the queued one.
    const { error: closeError } = await sb
      .from("visit_checkins")
      .update({
        checkout_time: row.checkin_time,
        checkout_lat: row.checkin_lat,
        checkout_lng: row.checkin_lng,
      })
      .eq("user_id", userId)
      .eq("company_id", row.company_id)
      .is("checkout_time", null);
    if (closeError) throw new Error(closeError.message);

    const { error } = await sb.from("visit_checkins").insert(row);
    if (error) throw new Error(error.message);
  });

  registerOutboxHandler("visit_checkout", async (item) => {
    const { id, ...patch } = item.payload as { id: string } & Record<string, any>;
    const { error } = await sb.from("visit_checkins").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  });

  registerOutboxHandler("lead_note", async (item) => {
    const { error } = await sb.from("crm_lead_activities").insert(item.payload);
    if (error) throw new Error(error.message);
  });

  registerOutboxHandler("task_update", async (item) => {
    const { id, ...patch } = item.payload as { id: string } & Record<string, any>;
    const { error } = await sb.from("tms_tasks").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  });
}
