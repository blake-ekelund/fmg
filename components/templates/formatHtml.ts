import { html_beautify } from "js-beautify";

/**
 * Pretty-print HTML so the code view is easy to read. Uploaded email HTML is
 * usually minified to one line; this re-indents it. Best-effort — if beautify
 * throws on something pathological, we return the input untouched rather than
 * lose the user's file.
 */
export function formatHtml(src: string): string {
  try {
    return html_beautify(src, {
      indent_size: 2,
      wrap_line_length: 0, // don't hard-wrap long attribute lists
      preserve_newlines: true,
      max_preserve_newlines: 2,
      end_with_newline: true,
    });
  } catch {
    return src;
  }
}
