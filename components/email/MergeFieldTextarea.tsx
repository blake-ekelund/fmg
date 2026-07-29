"use client";

import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { mergeGroupsFor, type Audience } from "@/lib/email/mergeFields";

/**
 * A textarea with a "/" slash-command menu for inserting merge fields exactly
 * at the cursor. Type "/" (at the start of a line or after a space) to open a
 * filtered list; arrow keys + Enter/Tab to insert {{token}}, Escape to dismiss.
 *
 * The boundary rule (only trigger after whitespace/line-start) is what makes
 * this safe inside raw HTML, where "/" otherwise appears constantly in
 * </tags>, self-closing <br/>, and https:// URLs.
 *
 * Controlled: pass `value` + `onValueChange`. Filtered to the email's audience
 * via `channel`, so a wholesale template never offers first/last name.
 */

type Item = { key: string; label: string; group: string };

type Props = {
  value: string;
  onValueChange: (v: string) => void;
  channel: Audience | "both";
  className?: string;
  /** Class for the relative wrapper (e.g. "relative h-full" for full-height code). */
  wrapperClassName?: string;
  rows?: number;
  placeholder?: string;
  spellCheck?: boolean;
  onFocus?: () => void;
};

// Caret pixel position inside a textarea, via a mirror element that copies the
// textarea's box + text styles. Adapted from the textarea-caret-position trick.
const MIRROR_PROPS = [
  "boxSizing", "width", "height", "overflowX", "overflowY",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize",
  "lineHeight", "fontFamily", "textAlign", "textTransform", "textIndent",
  "letterSpacing", "wordSpacing", "tabSize",
] as const;

function caretCoords(el: HTMLTextAreaElement, position: number): { top: number; left: number; height: number } {
  const div = document.createElement("div");
  const computed = window.getComputedStyle(el);
  const s = div.style;
  s.position = "absolute";
  s.visibility = "hidden";
  s.whiteSpace = "pre-wrap";
  s.wordWrap = "break-word";
  s.overflow = "hidden";
  const sRec = s as unknown as Record<string, string>;
  const cRec = computed as unknown as Record<string, string>;
  for (const prop of MIRROR_PROPS) {
    sRec[prop] = cRec[prop];
  }
  div.textContent = el.value.slice(0, position);
  const span = document.createElement("span");
  span.textContent = el.value.slice(position) || ".";
  div.appendChild(span);
  document.body.appendChild(div);
  const coords = {
    top: span.offsetTop + parseInt(computed.borderTopWidth || "0", 10),
    left: span.offsetLeft + parseInt(computed.borderLeftWidth || "0", 10),
    height: parseInt(computed.lineHeight || "16", 10) || 16,
  };
  document.body.removeChild(div);
  return coords;
}

/**
 * If the caret sits just after a boundary "/query", return the query + its
 * start index. Exported for testing — the boundary rule is what keeps the menu
 * from firing inside HTML (</tag>, https://, <br/>).
 */
export function activeQuery(value: string, caret: number): { query: string; start: number } | null {
  // Walk back from the caret over word characters to a "/".
  let i = caret - 1;
  while (i >= 0 && /[A-Za-z]/.test(value[i])) i--;
  if (i < 0 || value[i] !== "/") return null;
  const before = i === 0 ? "" : value[i - 1];
  // Only trigger at a boundary — start of input, or after whitespace.
  if (before !== "" && !/\s/.test(before)) return null;
  return { query: value.slice(i + 1, caret), start: i };
}

const MergeFieldTextarea = forwardRef<HTMLTextAreaElement, Props>(function MergeFieldTextarea(
  { value, onValueChange, channel, className, wrapperClassName, rows, placeholder, spellCheck, onFocus },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement, []);

  const allFields = useMemo<Item[]>(
    () => mergeGroupsFor(channel).flatMap((g) => g.fields.map((f) => ({ ...f, group: g.group }))),
    [channel],
  );

  const filterFields = (query: string): Item[] => {
    const q = query.toLowerCase();
    return allFields.filter(
      (f) => f.key.toLowerCase().includes(q) || f.label.toLowerCase().includes(q),
    );
  };

  const [menu, setMenu] = useState<
    | { open: false }
    | { open: true; start: number; query: string; top: number; left: number; index: number }
  >({ open: false });

  const matches = useMemo(
    () => (menu.open ? filterFields(menu.query) : []),
    // filterFields is stable per `channel`; menu carries the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menu, allFields],
  );

  function refresh() {
    const el = innerRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? 0;
    // Only consider a menu when there's no selection range.
    if ((el.selectionEnd ?? 0) !== caret) {
      setMenu({ open: false });
      return;
    }
    const found = activeQuery(el.value, caret);
    // Open only when the boundary "/query" matches at least one field, so an
    // over-narrowed or spurious "/" silently closes instead of showing nothing.
    if (!found || filterFields(found.query).length === 0) {
      setMenu({ open: false });
      return;
    }
    const c = caretCoords(el, found.start);
    setMenu({
      open: true,
      start: found.start,
      query: found.query,
      top: c.top - el.scrollTop + c.height,
      left: c.left - el.scrollLeft,
      index: 0,
    });
  }

  function insert(item: Item) {
    const el = innerRef.current;
    if (!el || !menu.open) return;
    const caret = el.selectionStart ?? value.length;
    const token = `{{${item.key}}}`;
    const next = value.slice(0, menu.start) + token + value.slice(caret);
    onValueChange(next);
    setMenu({ open: false });
    const pos = menu.start + token.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!menu.open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMenu({ ...menu, index: (menu.index + 1) % matches.length });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMenu({ ...menu, index: (menu.index - 1 + matches.length) % matches.length });
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insert(matches[Math.min(menu.index, matches.length - 1)]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMenu({ open: false });
    }
  }

  const activeIndex = menu.open ? Math.min(menu.index, Math.max(0, matches.length - 1)) : 0;

  return (
    <div className={wrapperClassName ?? "relative"}>
      <textarea
        ref={innerRef}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          // Defer so selectionStart reflects the new value.
          requestAnimationFrame(refresh);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) refresh();
        }}
        onClick={refresh}
        onFocus={onFocus}
        onBlur={() => setTimeout(() => setMenu({ open: false }), 120)}
        rows={rows}
        placeholder={placeholder}
        spellCheck={spellCheck}
        className={className}
      />

      {menu.open && matches.length > 0 && (
        <div
          className="absolute z-30 max-h-56 w-60 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          style={{ top: menu.top, left: menu.left }}
          // Keep focus in the textarea; act on mousedown before blur fires.
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Merge fields
          </div>
          {matches.map((f, i) => (
            <button
              key={f.key}
              type="button"
              onMouseEnter={() => menu.open && setMenu({ ...menu, index: i })}
              onClick={() => insert(f)}
              className={
                "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition " +
                (i === activeIndex ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50")
              }
            >
              <span className="font-medium">{f.label}</span>
              <span className="font-mono text-[10px] text-gray-400">{`{{${f.key}}}`}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default MergeFieldTextarea;
