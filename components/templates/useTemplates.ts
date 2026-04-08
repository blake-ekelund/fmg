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

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("email_templates").delete().eq("id", id);
    if (!error) setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const duplicate = useCallback(async (template: EmailTemplate) => {
    const { id, created_at, updated_at, ...rest } = template;
    return save({ ...rest, name: `${rest.name} (Copy)`, status: "draft" });
  }, [save]);

  return { templates, loading, save, remove, duplicate, refresh: fetch };
}
