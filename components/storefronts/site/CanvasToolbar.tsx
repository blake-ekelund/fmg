"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Copy,
  Eye,
  EyeOff,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Palette,
  Pilcrow,
  Puzzle,
  Settings2,
  Sparkles,
  Trash2,
  Unlink,
} from "lucide-react";

/**
 * The toolbar that floats over the selected block on the Website editor's
 * canvas (positioned from the store bridge's "rect" messages). Block actions
 * on the left; while text is being typed on the page, its formatting
 * buttons (sent back to the bridge as "format"). Colors open a pop-over;
 * everything without a place on the page (links, product picks …) is under
 * Settings, which opens the side panel.
 */

export type FormatCmd = "bold" | "italic" | "h2" | "h3" | "p" | "ul" | "ol" | "link" | "unlink" | "accent";
/** What's being typed: "inline" = *accent* / [link](…) text, "rich" = HTML. */
export type EditingKind = "plain" | "multi" | "inline" | "rich";

type Pos = { top: number; left: number; maxWidth: number };

function Btn({
  label,
  onClick,
  disabled,
  active,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      // Keep the canvas's text selection while clicking a format button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={clsx(
        "rounded-md p-1.5 transition disabled:cursor-not-allowed disabled:opacity-30",
        active ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/15 hover:text-white",
        danger && "hover:!bg-red-500/80",
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-4 w-px bg-white/20" />;

export function CanvasToolbar({
  pos,
  label,
  editing,
  canMoveUp,
  canMoveDown,
  canDuplicate,
  canHide,
  hidden,
  canDelete,
  canWidget,
  showColors,
  colorsCount,
  colorsPanel,
  onMove,
  onDuplicate,
  onToggleHidden,
  onWidget,
  onDelete,
  onSettings,
  onFormat,
}: {
  pos: Pos;
  label: string;
  editing: EditingKind | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDuplicate: boolean;
  canHide: boolean;
  hidden: boolean;
  canDelete: boolean;
  canWidget: boolean;
  showColors: boolean;
  colorsCount: number;
  colorsPanel: React.ReactNode;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onToggleHidden: () => void;
  onWidget: () => void;
  onDelete: () => void;
  onSettings: () => void;
  onFormat: (cmd: FormatCmd, value?: string) => void;
}) {
  const [colorsOpen, setColorsOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  // A click anywhere else closes the colors pop-over.
  useEffect(() => {
    if (!colorsOpen) return;
    const close = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setColorsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [colorsOpen]);

  const link = () => {
    const href = prompt("Link to — a page like /shop, or a full https:// address:");
    if (href?.trim()) onFormat("link", href.trim());
  };

  return (
    <div
      ref={wrap}
      className="absolute z-20"
      style={{ top: pos.top, left: pos.left, maxWidth: pos.maxWidth }}
    >
      <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-gray-900 px-1.5 py-1 text-white shadow-lg ring-1 ring-black/10">
        <span className="max-w-[10rem] truncate px-1.5 text-[11px] font-semibold">{label}</span>
        {editing === "rich" ? (
          <>
            <Sep />
            <Btn label="Bold" onClick={() => onFormat("bold")}>
              <Bold size={14} />
            </Btn>
            <Btn label="Italic" onClick={() => onFormat("italic")}>
              <Italic size={14} />
            </Btn>
            <Btn label="Heading" onClick={() => onFormat("h2")}>
              <Heading2 size={14} />
            </Btn>
            <Btn label="Small heading" onClick={() => onFormat("h3")}>
              <Heading3 size={14} />
            </Btn>
            <Btn label="Paragraph" onClick={() => onFormat("p")}>
              <Pilcrow size={14} />
            </Btn>
            <Btn label="Bulleted list" onClick={() => onFormat("ul")}>
              <List size={14} />
            </Btn>
            <Btn label="Numbered list" onClick={() => onFormat("ol")}>
              <ListOrdered size={14} />
            </Btn>
            <Btn label="Link" onClick={link}>
              <Link2 size={14} />
            </Btn>
            <Btn label="Remove link" onClick={() => onFormat("unlink")}>
              <Unlink size={14} />
            </Btn>
          </>
        ) : editing === "inline" ? (
          <>
            <Sep />
            <Btn label="Accent the selected words (or remove the accent)" onClick={() => onFormat("accent")}>
              <Sparkles size={14} />
            </Btn>
            <Btn label="Link the selected words" onClick={link}>
              <Link2 size={14} />
            </Btn>
            <Btn label="Remove link" onClick={() => onFormat("unlink")}>
              <Unlink size={14} />
            </Btn>
          </>
        ) : null}
        <Sep />
        <Btn label="Move up" disabled={!canMoveUp} onClick={() => onMove(-1)}>
          <ArrowUp size={14} />
        </Btn>
        <Btn label="Move down" disabled={!canMoveDown} onClick={() => onMove(1)}>
          <ArrowDown size={14} />
        </Btn>
        <Btn label="Duplicate" disabled={!canDuplicate} onClick={onDuplicate}>
          <Copy size={14} />
        </Btn>
        <Btn label={hidden ? "Show on site" : "Hide from site"} disabled={!canHide} onClick={onToggleHidden}>
          {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </Btn>
        {showColors ? (
          <Btn label="Colors" active={colorsOpen || colorsCount > 0} onClick={() => setColorsOpen((o) => !o)}>
            <Palette size={14} />
          </Btn>
        ) : null}
        <Btn label="Settings — links, products and everything not on the page" onClick={onSettings}>
          <Settings2 size={14} />
        </Btn>
        <Btn label="Save as widget (reuse on other pages)" disabled={!canWidget} onClick={onWidget}>
          <Puzzle size={14} />
        </Btn>
        <Btn label="Delete" danger disabled={!canDelete} onClick={onDelete}>
          <Trash2 size={14} />
        </Btn>
      </div>
      {colorsOpen ? (
        <div className="mt-1.5 max-h-[60vh] w-80 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-800">
            <Palette size={13} className="text-gray-400" /> Colors for this block
          </div>
          {colorsPanel}
        </div>
      ) : null}
    </div>
  );
}
