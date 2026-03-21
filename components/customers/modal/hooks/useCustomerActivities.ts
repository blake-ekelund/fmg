"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export type ActivityType = "note" | "email" | "call" | "meeting" | "task" | "follow_up";
export type ActivityStatus = "open" | "completed";
export type ActivityPriority = "low" | "medium" | "high";

export type Attachment = {
  name: string;
  url: string;
  size: number;
};

export type CustomerActivity = {
  id: string;
  customerid: string;
  type: ActivityType;
  subject: string;
  body: string | null;
  due_date: string | null;
  status: ActivityStatus;
  priority: ActivityPriority | null;
  location: string | null;
  attachments: Attachment[] | null;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
};

export type NewActivity = {
  type: ActivityType;
  subject: string;
  body?: string;
  due_date?: string | null;
  priority?: ActivityPriority | null;
  location?: string | null;
  files?: File[];
};

const BUCKET = "customer-attachments";

export default function useCustomerActivities(customerId: string | null) {
  const [activities, setActivities] = useState<CustomerActivity[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("customer_activities")
      .select("*")
      .eq("customerid", customerId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("customer_activities:", error.message);
      setActivities([]);
    } else {
      setActivities((data as CustomerActivity[]) ?? []);
    }

    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  const uploadFiles = useCallback(
    async (activityId: string, files: File[]): Promise<Attachment[]> => {
      const attachments: Attachment[] = [];

      for (const file of files) {
        const path = `${customerId}/${activityId}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file);

        if (error) {
          console.error("Upload error:", error.message);
          continue;
        }

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

        attachments.push({
          name: file.name,
          url: urlData.publicUrl,
          size: file.size,
        });
      }

      return attachments;
    },
    [customerId]
  );

  const addActivity = useCallback(
    async (activity: NewActivity) => {
      if (!customerId) return;

      // Insert activity first to get the ID
      const row: Record<string, unknown> = {
        customerid: customerId,
        type: activity.type,
        subject: activity.subject,
        body: activity.body ?? null,
        due_date: activity.due_date ?? null,
        priority: activity.priority ?? null,
        location: activity.location ?? null,
        status: "open",
      };

      const { data: inserted, error } = await supabase
        .from("customer_activities")
        .insert(row)
        .select("id")
        .single();

      if (error || !inserted) {
        console.error("Failed to add activity:", error?.message);
        return;
      }

      // Upload files if any
      if (activity.files && activity.files.length > 0) {
        const attachments = await uploadFiles(inserted.id, activity.files);

        if (attachments.length > 0) {
          await supabase
            .from("customer_activities")
            .update({ attachments })
            .eq("id", inserted.id);
        }
      }

      await load();
    },
    [customerId, load, uploadFiles]
  );

  const toggleComplete = useCallback(
    async (id: string, currentStatus: ActivityStatus) => {
      const newStatus = currentStatus === "open" ? "completed" : "open";
      const { error } = await supabase
        .from("customer_activities")
        .update({
          status: newStatus,
          completed_at: newStatus === "completed" ? new Date().toISOString() : null,
        })
        .eq("id", id);

      if (error) {
        console.error("Failed to toggle activity:", error.message);
        return;
      }

      setActivities((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, status: newStatus, completed_at: newStatus === "completed" ? new Date().toISOString() : null }
            : a
        )
      );
    },
    []
  );

  const updateActivity = useCallback(
    async (id: string, updates: Partial<NewActivity>) => {
      const row: Record<string, unknown> = {};
      if (updates.type !== undefined) row.type = updates.type;
      if (updates.subject !== undefined) row.subject = updates.subject;
      if (updates.body !== undefined) row.body = updates.body || null;
      if (updates.due_date !== undefined) row.due_date = updates.due_date || null;
      if (updates.priority !== undefined) row.priority = updates.priority || null;
      if (updates.location !== undefined) row.location = updates.location || null;

      const { error } = await supabase
        .from("customer_activities")
        .update(row)
        .eq("id", id);

      if (error) {
        console.error("Failed to update activity:", error.message);
        return;
      }

      // Handle new file uploads
      if (updates.files && updates.files.length > 0) {
        const newAttachments = await uploadFiles(id, updates.files);
        if (newAttachments.length > 0) {
          // Merge with existing attachments
          const existing = activities.find((a) => a.id === id);
          const merged = [...(existing?.attachments ?? []), ...newAttachments];
          await supabase
            .from("customer_activities")
            .update({ attachments: merged })
            .eq("id", id);
        }
      }

      await load();
    },
    [activities, load, uploadFiles]
  );

  const deleteActivity = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("customer_activities")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Failed to delete activity:", error.message);
        return;
      }

      setActivities((prev) => prev.filter((a) => a.id !== id));
    },
    []
  );

  return { activities, loading, addActivity, updateActivity, toggleComplete, deleteActivity, reload: load };
}
