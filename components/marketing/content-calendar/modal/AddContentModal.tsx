"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  ContentItem,
  ContentStatus,
  Brand,
  Platform,
  ContentType,
  StrategyType,
} from "../types";

import { ModalShell } from "./ModalShell";
import { SetupSection } from "./sections/SetupSection";
import { ContentSection } from "./sections/ContentSection";
import { ActivitySection } from "./sections/ActivitySection";

type Section = "setup" | "content" | "activity";

type Props = {
  date: string | null;
  item?: ContentItem | null;
  onClose: () => void;
  onSaved: () => void;
  onBack?: () => void;
};

/* -------------------------------------------------- */
/* Activity Logger                                    */
/* -------------------------------------------------- */

async function logActivity(
  contentId: string,
  eventType: "status_changed" | "content_updated",
  eventLabel: string,
  performedBy: string,
  metadata?: { from?: ContentStatus; to?: ContentStatus }
) {
  const { error } = await supabase
    .from("marketing_content_activity")
    .insert({
      content_id: contentId,
      event_type: eventType,
      event_label: eventLabel,
      metadata: metadata ?? null,
      performed_by: performedBy,
    });

  if (error) console.error("Activity log error:", error);
}

/* -------------------------------------------------- */
/* Valid Workflow Transitions                         */
/* -------------------------------------------------- */

const allowedTransitions: Record<ContentStatus, ContentStatus[]> = {
  Draft: ["Review"],
  Review: ["Published"],
  Published: [],
};

/* -------------------------------------------------- */
/* Modal Component                                    */
/* -------------------------------------------------- */

export default function AddContentModal({
  date,
  item,
  onClose,
  onSaved,
  onBack,
}: Props) {
  const [activeSection, setActiveSection] =
    useState<Section>("setup");

  const [publishDate, setPublishDate] = useState(
    item?.publish_date ??
      date ??
      new Date().toISOString().split("T")[0]
  );

  const [brands, setBrands] = useState<Brand[]>(
    item ? [item.brand] : ["NI"]
  );

  const [platforms, setPlatforms] =
    useState<Platform[]>(
      item ? [item.platform] : ["Instagram"]
    );

  const [contentType, setContentType] =
    useState<ContentType | "">(
      item?.content_type ?? ""
    );

  const [strategy, setStrategy] =
    useState<StrategyType | "">(
      item?.strategy ?? ""
    );

  const [description, setDescription] =
    useState(item?.description ?? "");

  const [status, setStatus] =
    useState<ContentStatus>(
      item?.status ?? "Draft"
    );

  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  /* -------------------------------------------------- */
  /* Delete Logic                                       */
  /* -------------------------------------------------- */

  async function handleDelete() {
    if (!item?.id) return;

    if (!confirm("Delete this content?")) return;

    const { error } = await supabase
      .from("marketing_content")
      .delete()
      .eq("id", item.id);

    if (error) {
      console.error(error);
      return;
    }

    onSaved();
  }

  /* -------------------------------------------------- */
  /* Save Logic                                         */
  /* -------------------------------------------------- */

  async function save() {
    if (
      !publishDate ||
      !brands.length ||
      !platforms.length ||
      !contentType ||
      !strategy
    ) {
      console.warn("Missing required fields");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user?.id)
        throw new Error("User not authenticated");

      const userId = user.id;

      /* ============================================= */
      /* UPDATE EXISTING                               */
      /* ============================================= */

      if (item) {
        if (
          item.status !== status &&
          !allowedTransitions[item.status].includes(
            status
          )
        ) {
          throw new Error(
            `Invalid workflow transition: ${item.status} → ${status}`
          );
        }

        const payload = {
          publish_date: publishDate,
          brand: brands[0],
          platform: platforms[0],
          content_type: contentType,
          strategy,
          description,
          status,
        };

        const { error } = await supabase
          .from("marketing_content")
          .update(payload)
          .eq("id", item.id);

        if (error) throw error;

        if (item.status !== status) {
          await logActivity(
            item.id,
            "status_changed",
            `Moved from ${item.status} to ${status}`,
            userId,
            { from: item.status, to: status }
          );
        }

        if (
          item.description !== description ||
          item.content_type !== contentType ||
          item.strategy !== strategy
        ) {
          await logActivity(
            item.id,
            "content_updated",
            "Content details updated",
            userId
          );
        }

        onSaved();
        return;
      }

      /* ============================================= */
      /* INSERT NEW                                    */
      /* ============================================= */

      const rows = brands.flatMap((brand) =>
        platforms.map((platform) => ({
          publish_date: publishDate,
          brand,
          platform,
          content_type: contentType,
          strategy,
          description,
          status,
          created_by: userId,
        }))
      );

      const { data, error } = await supabase
        .from("marketing_content")
        .insert(rows)
        .select("id");

      if (error) throw error;
      if (!data) throw new Error("Insert failed");

      for (const row of data) {
        await logActivity(
          row.id,
          "status_changed",
          "Draft created",
          userId,
          { to: "Draft" }
        );

        if (status === "Review") {
          await logActivity(
            row.id,
            "status_changed",
            "Moved to Review",
            userId,
            { from: "Draft", to: "Review" }
          );
        }

        if (status === "Published") {
          await logActivity(
            row.id,
            "status_changed",
            "Moved to Review",
            userId,
            { from: "Draft", to: "Review" }
          );

          await logActivity(
            row.id,
            "status_changed",
            "Moved to Published",
            userId,
            { from: "Review", to: "Published" }
          );
        }
      }

      onSaved();
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setLoading(false);
    }
  }

  /* -------------------------------------------------- */

  return (
    <ModalShell
      title={item ? "Edit Content" : "Add Content"}
      onClose={onClose}
      onBack={onBack}
      footer={
        <div className="flex justify-between items-center gap-4">
          <button
            onClick={onClose}
            className="text-sm text-gray-500"
          >
            Cancel
          </button>

          <button
            onClick={save}
            disabled={loading}
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
    <div className="sticky top-0 z-10 bg-white flex items-center justify-between gap-4 mb-4 pb-2 border-b border-gray-100">
      
      {/* Section Tabs */}
      <div className="flex gap-2 text-sm">
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
      </div>

      {/* Status Control */}
      <StatusSelector
        current={status}
        onChange={(next) => setStatus(next)}
        previous={item?.status}
      />
    </div>

      <div className="flex-1 overflow-y-auto pr-1">
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
            onDelete={item ? handleDelete : undefined}
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
          <ActivitySection
            contentId={item?.id ?? null}
          />
        )}
      </div>
    </ModalShell>
  );
}

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
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
        active
          ? "bg-gray-900 text-white"
          : "text-gray-500 hover:bg-gray-100"
      }`}
    >
      {label}
    </button>
  );
}

function StatusSelector({
  current,
  previous,
  onChange,
}: {
  current: ContentStatus;
  previous?: ContentStatus;
  onChange: (s: ContentStatus) => void;
}) {
  const options: ContentStatus[] = [
    "Draft",
    "Review",
    "Published",
  ];

  return (
    <select
      value={current}
      onChange={(e) =>
        onChange(e.target.value as ContentStatus)
      }
      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
