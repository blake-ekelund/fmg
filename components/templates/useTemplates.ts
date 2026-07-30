"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { EmailTemplate, EmailBlock, TemplateType } from "./types";

export function useTemplates(typeFilter?: TemplateType) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("email_templates")
      .select("*")
      .order("updated_at", { ascending: false });

    if (typeFilter) q = q.eq("type", typeFilter);

    const { data, error } = await q;
    if (!error && data) setTemplates(data as EmailTemplate[]);
    setLoading(false);
  }, [typeFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  const save = useCallback(async (template: Partial<EmailTemplate> & { id?: string }) => {
    const payload = {
      ...template,
      blocks: template.blocks ? JSON.parse(JSON.stringify(template.blocks)) : undefined,
      updated_at: new Date().toISOString(),
    };

    if (template.id) {
      const { data, error } = await supabase
        .from("email_templates")
        .update(payload)
        .eq("id", template.id)
        .select()
        .single();
      if (!error && data) {
        setTemplates((prev) => prev.map((t) => (t.id === data.id ? data as EmailTemplate : t)));
        return data as EmailTemplate;
      }
    } else {
      const { data, error } = await supabase
        .from("email_templates")
        .insert(payload)
        .select()
        .single();
      if (!error && data) {
        setTemplates((prev) => [data as EmailTemplate, ...prev]);
        return data as EmailTemplate;
      }
    }
    return null;
  }, []);

  /**
   * Delete a template. Routes through the API so an automation-in-use template
   * fails cleanly (409) instead of a swallowed FK error. Pass force=true to
   * detach it from any automation steps and delete anyway. Returns a result so
   * the UI can warn before breaking a live sequence.
   */
  const remove = useCallback(
    async (
      id: string,
      force = false,
    ): Promise<
      | { ok: true }
      | { ok: false; error: string; inUse?: boolean; automations?: string[] }
    > => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      // NB: `fetch` is shadowed in this hook by the loader above — use window.fetch.
      const res = await window.fetch(`/api/email/templates/${id}${force ? "?force=true" : ""}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 204) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        return { ok: true };
      }
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        return { ok: false, error: json.error ?? "In use", inUse: true, automations: json.automations ?? [] };
      }
      return { ok: false, error: json.error ?? `Delete failed (${res.status})` };
    },
    [],
  );

  const duplicate = useCallback(async (template: EmailTemplate) => {
    const { id, created_at, updated_at, ...rest } = template;
    return save({ ...rest, name: `${rest.name} (Copy)`, status: "draft" });
  }, [save]);

  return { templates, loading, save, remove, duplicate, refresh: fetch };
}
