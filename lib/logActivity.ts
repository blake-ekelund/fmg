import type { SupabaseClient } from "@supabase/supabase-js";

export async function logActivity(
  supabase: SupabaseClient,
  contentId: string,
  eventType: string,
  eventLabel: string,
  metadata?: Record<string, any>
) {
  await supabase.from("marketing_content_activity").insert({
    content_id: contentId,
    event_type: eventType,
    event_label: eventLabel,
    metadata: metadata ?? null,
  });
}
