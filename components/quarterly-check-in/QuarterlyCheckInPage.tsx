"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Star,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Mail,
} from "lucide-react";
import clsx from "clsx";

type Status =
  | { state: "form" }
  | { state: "submitting" }
  | { state: "success" }
  | { state: "error"; message: string };

export default function QuarterlyCheckInPage() {
  const params = useSearchParams();

  // Customer attribution from query string (e.g. ?customer=10025&type=wholesale).
  // Production version will swap this for a signed token. For dev we just trust
  // whatever's in the URL and let the user override.
  const initialName = params.get("name") ?? "";
  const initialEmail = params.get("email") ?? "";
  const initialRef = params.get("customer") ?? null;
  const initialType = (params.get("type") as "d2c" | "wholesale" | null) ?? null;

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [rating, setRating] = useState<number | null>(null);
  const [wentWell, setWentWell] = useState("");
  const [didntGoWell, setDidntGoWell] = useState("");
  const [toImprove, setToImprove] = useState("");
  const [status, setStatus] = useState<Status>({ state: "form" });

  // Pull initial state from query whenever it changes (covers route remounts).
  useEffect(() => {
    if (initialName) setName(initialName);
    if (initialEmail) setEmail(initialEmail);
  }, [initialName, initialEmail]);

  const canSubmit = useMemo(() => {
    if (status.state !== "form") return false;
    // Require at least one piece of feedback or a rating.
    return (
      rating != null ||
      wentWell.trim().length > 0 ||
      didntGoWell.trim().length > 0 ||
      toImprove.trim().length > 0
    );
  }, [status.state, rating, wentWell, didntGoWell, toImprove]);

  async function submit() {
    if (!canSubmit) return;
    setStatus({ state: "submitting" });
    try {
      const res = await fetch("/api/quarterly-check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_type: initialType ?? undefined,
          customer_ref: initialRef ?? undefined,
          customer_name: name.trim() || undefined,
          customer_email: email.trim() || undefined,
          rating,
          what_went_well: wentWell.trim() || undefined,
          what_didnt_go_well: didntGoWell.trim() || undefined,
          what_to_improve: toImprove.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({
          state: "error",
          message: json?.error ?? `Something went wrong (${res.status}).`,
        });
        return;
      }
      setStatus({ state: "success" });
    } catch (e) {
      setStatus({
        state: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-gray-900 text-white text-lg font-semibold mb-3">
            F
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900">
            Quarterly check-in
          </h1>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Three minutes of your honest feedback helps us make the next order
            better. Complete this and we&apos;ll send your 15% off code.
          </p>
        </div>

        {status.state === "success" ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-6 py-8 text-center">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-green-100 text-green-700 mb-3">
              <CheckCircle2 size={22} />
            </div>
            <h2 className="text-lg font-semibold text-green-900">
              Thanks for the feedback!
            </h2>
            <p className="text-sm text-green-800 mt-2 max-w-sm mx-auto">
              Your 15% off code:
            </p>
            <div className="mt-3 inline-block rounded-lg bg-white border border-green-300 px-4 py-2 font-mono text-base text-green-900">
              WELCOMEBACK15
            </div>
            <p className="text-xs text-green-700/70 mt-3">
              Good for the next 60 days. No minimum.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="px-6 py-6 space-y-5">
              {status.state === "error" && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 inline-flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>{status.message}</span>
                </div>
              )}

              {/* Name + email — small, optional, pre-filled when we can */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Your name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </Field>
                <Field label="Email" hint="So we can follow up if needed">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </Field>
              </div>

              {/* Star rating */}
              <Field label="Overall, how was it?">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(rating === n ? null : n)}
                      className="p-1 transition transform hover:scale-110"
                      aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    >
                      <Star
                        size={28}
                        className={clsx(
                          "transition",
                          rating != null && n <= rating
                            ? "fill-amber-400 text-amber-400"
                            : "text-gray-300 hover:text-amber-300",
                        )}
                      />
                    </button>
                  ))}
                  {rating != null && (
                    <button
                      onClick={() => setRating(null)}
                      className="ml-2 text-[11px] text-gray-400 hover:text-gray-700"
                    >
                      clear
                    </button>
                  )}
                </div>
              </Field>

              {/* Open-ended fields */}
              <Field label="What went well?" hint="Tell us what you loved.">
                <textarea
                  value={wentWell}
                  onChange={(e) => setWentWell(e.target.value)}
                  rows={3}
                  placeholder="The fragrance was perfect for autumn…"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y"
                />
              </Field>

              <Field label="What didn't go well?" hint="Be candid — it helps.">
                <textarea
                  value={didntGoWell}
                  onChange={(e) => setDidntGoWell(e.target.value)}
                  rows={3}
                  placeholder="Shipping took longer than expected…"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y"
                />
              </Field>

              <Field
                label="What can we do better next time?"
                hint="Any change, big or small."
              >
                <textarea
                  value={toImprove}
                  onChange={(e) => setToImprove(e.target.value)}
                  rows={3}
                  placeholder="Add gift wrapping as an option…"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y"
                />
              </Field>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between">
              <span className="text-[11px] text-gray-400 inline-flex items-center gap-1">
                <Mail size={11} />
                Replies stay between you and our team.
              </span>
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-5 py-2.5 text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {status.state === "submitting" && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                {status.state === "submitting"
                  ? "Sending…"
                  : "Send feedback & get my code"}
              </button>
            </div>
          </div>
        )}

        <p className="text-[10px] text-center text-gray-400 mt-6">
          Fragrance Marketing Group · We never share your responses.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-700 mb-1.5 block">
        {label}
        {hint && (
          <span className="ml-1.5 font-normal text-gray-400">— {hint}</span>
        )}
      </label>
      {children}
    </div>
  );
}
