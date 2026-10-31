"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ListChecks, Loader2, Plus, Trash2 } from "lucide-react";
import { reportsApi } from "@/lib/reports/client";
import { HOUSE_RULES, type HouseRule } from "@/lib/reports/rules";

/* "Report rules" on the Reports page: the team's own rules (anyone can add;
   the author or an owner/admin removes) on top of the built-in house rules
   Sage always follows. Sage reads both every time it builds or suggests. */

type TeamRule = { id: string; text: string; created_by: string | null; author: string | null; created_at: string };
type Resp = { ready: boolean; rules: TeamRule[]; me: string; admin: boolean };

const GROUPS: HouseRule["group"][] = ["Data", "Layout", "KPIs", "Charts", "Tables"];
const EXAMPLES = ["Always show Natural Inspirations before Sassy", "No pie charts", "Money without cents", "Wholesale reports leave out Faire orders"];

export default function ReportRules() {
  const [data, setData] = useState<Resp | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHouse, setShowHouse] = useState(false);

  useEffect(() => {
    reportsApi<Resp>("/api/reports/rules")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the rules."));
  }, []);

  async function add() {
    if (!text.trim()) return;
    setBusy("add");
    setError(null);
    try {
      const { rule } = await reportsApi<{ rule: TeamRule }>("/api/reports/rules", { method: "POST", body: { text } });
      setData((d) => (d ? { ...d, rules: [...d.rules, { ...rule, author: "You" }] } : d));
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the rule.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(r: TeamRule) {
    if (!confirm(`Remove the rule “${r.text}”?`)) return;
    setBusy(r.id);
    setError(null);
    try {
      await reportsApi(`/api/reports/rules?id=${r.id}`, { method: "DELETE" });
      setData((d) => (d ? { ...d, rules: d.rules.filter((x) => x.id !== r.id) } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the rule.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="rules" className="scroll-mt-20 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <ListChecks className="h-4 w-4 text-brand-500" /> Report rules
      </h2>
      <p className="mt-0.5 text-xs text-ink-muted">
        Sage follows these every time it builds a report, changes one, or recommends additions. Your team&apos;s rules win over the built-in ones. You can also just tell Sage
        (“from now on, no pie charts”) and it saves the rule here.
      </p>

      {error && <div className="mt-3 rounded-lg bg-critical-soft px-3 py-2 text-xs text-critical">{error}</div>}

      <div className="mt-4 text-xs font-semibold text-ink-secondary">Team rules</div>
      {!data ? (
        !error && (
          <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        )
      ) : !data.ready ? (
        <div className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          Team rules need a database update (migration 20261031010000). The built-in rules below already apply.
        </div>
      ) : (
        <>
          {data.rules.length ? (
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {data.rules.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-ink">{r.text}</div>
                    {r.author && <div className="text-[11px] text-ink-subtle">Added by {r.author}</div>}
                  </div>
                  {(data.admin || r.created_by === data.me || r.author === "You") && (
                    <button
                      onClick={() => remove(r)}
                      disabled={!!busy}
                      className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted hover:text-critical disabled:opacity-40"
                      aria-label={`Remove rule: ${r.text}`}
                    >
                      {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 text-xs text-ink-muted">None yet.</div>
          )}
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={400}
              placeholder={`e.g. ${EXAMPLES[0]}`}
              className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm placeholder:text-ink-subtle focus:border-brand-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!text.trim() || !!busy}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add rule
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.slice(1).map((ex) => (
              <button key={ex} onClick={() => setText(ex)} className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-ink-muted hover:border-brand-300 hover:text-brand-700">
                {ex}
              </button>
            ))}
          </div>
        </>
      )}

      <button onClick={() => setShowHouse((s) => !s)} className="mt-5 flex items-center gap-1 text-xs font-semibold text-ink-secondary hover:text-ink">
        <ChevronDown className={`h-3.5 w-3.5 transition ${showHouse ? "" : "-rotate-90"}`} />
        Built-in rules ({HOUSE_RULES.length})
      </button>
      {showHouse && (
        <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{g}</div>
              <ul className="mt-1 space-y-1">
                {HOUSE_RULES.filter((r) => r.group === g).map((r) => (
                  <li key={r.id} className="text-xs leading-relaxed text-ink-secondary">
                    • {r.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
