"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  ContentItem,
  ContentMeta,
  ContentStatus,
  Brand,
  Platform,
} from "../types";

import { ModalShell } from "./ModalShell";
import { SetupSection } from "./sections/SetupSection";
import { ContentSection } from "./sections/ContentSection";
import { ActivitySection } from "./sections/ActivitySection";

/* ---------------- Types ---------------- */

type Section = "setup" | "content" | "activity";

type Props = {
  date: string | null;
  item?: ContentItem | null; // calendar row
  meta?: ContentMeta | null; // activity metadata
  onClose: () => void;
  onSaved: () => void;
  onBack?: () => void;
};

/* ---------------- Activity Logger ---------------- */

async function logActivity(
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

/* ---------------- Modal ---------------- */

export default function AddContentModal({
  date,
  item,
  meta,
  onClose,
  onSaved,
  onBack,
}: Props) {
  const [activeSection, setActiveSection] =
    useState<Section>("setup");

  /* ---------- Draft State ---------- */

  const [publishDate, setPublishDate] = useState(
    item?.publish_date ??
      date ??
      new Date().toISOString().split("T")[0]
  );

  const [brands, setBrands] = useState<Brand[]>(
    item ? [item.brand] : ["NI"]
  );

  const [platforms, setPlatforms] = useState<Platform[]>(
    item ? [item.platform] : ["Instagram"]
  );

  const [contentType, setContentType] = useState(
    item?.content_type ?? ""
  );

  const [strategy, setStrategy] = useState(
    item?.strategy ?? ""
  );

  const [description, setDescription] = useState(
    item?.description ?? ""
  );

  const [status, setStatus] = useState<ContentStatus>(
    item?.status ?? "Not Started"
  );

  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  /* ---------- Media Upload ---------- */

  async function uploadMedia(
    contentId: string,
    files: File[]
  ) {
    let index = 0;

    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `${contentId}/${index}.${ext}`;

      const { error } = await supabase.storage
        .from("marketing-content")
        .upload(path, file);

      if (error) throw error;

      await supabase.from("marketing_content_media").insert({
        content_id: contentId,
        media_type: file.type.startsWith("video")
          ? "video"
          : "image",
        storage_path: path,
        sort_order: index,
      });

      index++;
    }

    await logActivity(
      contentId,
      "media_added",
      `Added ${files.length} media item${
        files.length > 1 ? "s" : ""
      }`,
      { count: files.length }
    );
  }

  /* ---------- Save ---------- */

  async function save() {
    if (!publishDate || !brands.length || !platforms.length)
      return;

    setLoading(true);

    let contentIds: string[] = [];

    if (item) {
      /* ---------- UPDATE ---------- */
      await supabase
        .from("marketing_content")
        .update({
          publish_date: publishDate,
          brand: brands[0],
          platform: platforms[0],
          content_type: contentType,
          strategy,
          description,
          status,
        })
        .eq("id", item.id);

      contentIds = [item.id];

      await logActivity(
        item.id,
        "updated",
        "Content updated",
        { status }
      );
    } else {
      /* ---------- CREATE ---------- */
      const rows = brands.flatMap((brand) =>
        platforms.map((platform) => ({
          publish_date: publishDate,
          brand,
          platform,
          content_type: contentType,
          strategy,
          description,
          status,
        }))
      );

      const { data, error } = await supabase
        .from("marketing_content")
        .insert(rows)
        .select("id");

      if (error) throw error;

      contentIds = data.map((r) => r.id);

      for (const id of contentIds) {
        await logActivity(id, "created", "Content created");
        await logActivity(
          id,
          "calendarized",
          "Post calendarized",
          { publish_date: publishDate }
        );
      }
    }

    if (files.length && contentIds.length) {
      await uploadMedia(contentIds[0], files);
    }

    setLoading(false);
    onSaved();
  }

  return (
    <ModalShell
      title={item ? "Edit Content" : "Add Content"}
      onClose={onClose}
      onBack={onBack}
      footer={
        <div className="flex justify-between">
          <button
            onClick={onClose}
            className="text-sm text-gray-500"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={loading}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      {/* ---------- Nav ---------- */}
      <nav className="flex gap-4 text-sm mb-4">
        <NavItem
          label="Setup"
          active={activeSection === "setup"}
          onClick={() => setActiveSection("setup")}
        />
        <NavItem
          label="Content"
          active={activeSection === "content"}
          onClick={() => setActiveSection("content")}
        />
        <NavItem
          label="Activity"
          active={activeSection === "activity"}
          onClick={() => setActiveSection("activity")}
        />
      </nav>

      {/* ---------- Sections ---------- */}
      <div className="h-full overflow-y-auto pr-1">
        {activeSection === "setup" && (
          <SetupSection
            publishDate={publishDate}
            setPublishDate={setPublishDate}
            brands={brands}
            setBrands={setBrands}
            platforms={platforms}
            setPlatforms={setPlatforms}
            status={status}
            setStatus={setStatus}
            locked={!!item}
          />
        )}

        {activeSection === "content" && (
          <ContentSection
            contentType={contentType}
            setContentType={setContentType}
            strategy={strategy}
            setStrategy={setStrategy}
            description={description}
            setDescription={setDescription}
            files={files}
            setFiles={setFiles}
          />
        )}

        {activeSection === "activity" && (
          <ActivitySection meta={meta} />
        )}
      </div>
    </ModalShell>
  );
}

/* ---------- Nav Item ---------- */

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded-md text-sm ${
        active
          ? "bg-gray-900 text-white"
          : "text-gray-500 hover:bg-gray-100"
      }`}
    >
      {label}
    </button>
  );
}
