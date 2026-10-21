"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  ChevronDown,
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
 * say what they do (Colors, Settings, More); while text is being typed on
 * the page, its formatting buttons (sent back to the bridge as "format").
 * Colors and More open pop-overs; everything without a place on the page
 * (links, product picks …) is under Settings, which opens the side panel.
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
  const [menu, setMenu] = useState<"colors" | "more" | null>(null);
  const toggle = (m: "colors" | "more") => setMenu((cur) => (cur === m ? null : m));
  const act = (fn: () => void) => {
    setMenu(null);
    fn();
  };
  const wrap = useRef<HTMLDivElement | null>(null);

  // A click anywhere else closes the colors / More pop-over.
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

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
        {showColors ? (
          <Btn label="Colors for this section" active={menu === "colors" || colorsCount > 0} onClick={() => toggle("colors")}>
            <span className="inline-flex items-center gap-1 px-0.5 text-[11px] font-medium">
              <Palette size={13} /> Colors
            </span>
          </Btn>
        ) : null}
        <Btn label="Settings — links, products and everything not on the page" onClick={onSettings}>
          <span className="inline-flex items-center gap-1 px-0.5 text-[11px] font-medium">
            <Settings2 size={13} /> Settings
          </span>
        </Btn>
        <Btn label="More — duplicate, hide, save for reuse, delete" active={menu === "more"} onClick={() => toggle("more")}>
          <span className="inline-flex items-center gap-1 px-0.5 text-[11px] font-medium">
            More <ChevronDown size={12} />
          </span>
        </Btn>
      </div>
      {menu === "colors" ? (
        <div className="mt-1.5 max-h-[60vh] w-80 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-800">
            <Palette size={13} className="text-gray-400" /> Colors for this section
          </div>
          {colorsPanel}
        </div>
      ) : menu === "more" ? (
        <div className="mt-1.5 w-60 rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
          <MenuItem disabled={!canDuplicate} onClick={() => act(onDuplicate)}>
            <Copy size={14} /> Duplicate
          </MenuItem>
          <MenuItem disabled={!canHide} onClick={() => act(onToggleHidden)}>
            {hidden ? <Eye size={14} /> : <EyeOff size={14} />} {hidden ? "Show on the site again" : "Hide from the site"}
          </MenuItem>
          <MenuItem disabled={!canWidget} onClick={() => act(onWidget)}>
            <Puzzle size={14} /> Save to reuse on other pages
          </MenuItem>
          <div className="my-1 h-px bg-gray-100" />
          <MenuItem danger disabled={!canDelete} onClick={() => act(onDelete)}>
            <Trash2 size={14} /> Delete section
          </MenuItem>
          {!canDelete ? (
            <p className="px-2.5 pb-1.5 pt-0.5 text-[10px] leading-snug text-gray-400">
              This part is built by the store — you can change its words, not remove it.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  onClick,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-35",
        danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-100",
      )}
    >
      {children}
    </button>
  );
}
