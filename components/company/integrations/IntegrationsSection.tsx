"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Mail,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type OutlookStatus =
  | { state: "loading" }
  | { state: "disconnected" }
  | {
      state: "connected";
      email: string;
      displayName: string | null;
      status: "connected" | "needs_reconnect";
      lastError: string | null;
      connectedAt: string | null;
    };

async function authHeader(): Promise<Record<string, string>> {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function IntegrationsSection() {
  const [outlook, setOutlook] = useState<OutlookStatus>({ state: "loading" });
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/email/outlook/status", { headers: await authHeader() });
      if (!res.ok) {
        setOutlook({ state: "disconnected" });
        return;
      }
      const json = await res.json();
      if (json?.connected) {
        setOutlook({
          state: "connected",
          email: json.email,
          displayName: json.displayName ?? null,
          status: json.status,
          lastError: json.lastError ?? null,
          connectedAt: json.connectedAt ?? null,
        });
      } else {
        setOutlook({ state: "disconnected" });
      }
    } catch {
      setOutlook({ state: "disconnected" });
    }
  }, []);

  useEffect(() => {
    refresh();
    // Pick up any return-from-OAuth banner.
    const params = new URLSearchParams(window.location.search);
    const result = params.get("outlook");
    const reason = params.get("reason");
    if (result === "connected") {
      setBanner({ kind: "ok", text: "Outlook connected." });
    } else if (result === "error") {
      setBanner({
        kind: "error",
        text: reason ? `Couldn't connect Outlook: ${reason}` : "Couldn't connect Outlook.",
      });
    }
    if (result) {
      const url = new URL(window.location.href);
      url.searchParams.delete("outlook");
      url.searchParams.delete("reason");
      window.history.replaceState(null, "", url.toString());
    }
  }, [refresh]);

  async function connect() {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch("/api/email/outlook/connect", {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok || !json?.url) {
        setBanner({
          kind: "error",
          text: `Could not start: ${json?.error ?? res.status}`,
        });
        setBusy(false);
        return;
      }
      window.location.href = json.url;
    } catch (e) {
      setBanner({
        kind: "error",
        text: e instanceof Error ? e.message : String(e),
      });
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect your Outlook mailbox? You can reconnect any time.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/email/outlook/disconnect", {
        method: "POST",
        headers: await authHeader(),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setBanner({ kind: "error", text: `Disconnect failed: ${json?.error ?? res.status}` });
      } else {
        setBanner({ kind: "ok", text: "Outlook disconnected." });
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Integrations</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Connect your personal accounts to the portal. Each user connects their own —
          your colleagues won&apos;t see your mailbox or send on your behalf.
        </p>
      </div>

      {banner && (
        <div
          className={
            "rounded-lg border px-3 py-2 text-xs " +
            (banner.kind === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700")
          }
        >
          {banner.text}
        </div>
      )}

      {/* Outlook card */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
              <Mail size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-gray-900">Microsoft Outlook</div>
                <StatusPill status={outlook} />
              </div>
              <p className="text-xs text-gray-500 mt-0.5 max-w-md">
                Send emails to customers from your own mailbox, and see replies threaded
                in the customer record. Email still lands in your normal Outlook inbox.
              </p>
              {outlook.state === "connected" && (
                <div className="mt-2 text-xs text-gray-600">
                  Connected as <span className="font-medium text-gray-900">{outlook.email}</span>
                  {outlook.connectedAt && (
                    <span className="text-gray-400">
                      {" "}
                      · since {new Date(outlook.connectedAt).toLocaleDateString()}
                    </span>
                  )}
                  {outlook.status === "needs_reconnect" && outlook.lastError && (
                    <div className="text-amber-600 mt-0.5">
                      Needs reconnect: {outlook.lastError}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {outlook.state === "loading" && (
              <div className="inline-flex items-center gap-2 text-xs text-gray-400">
                <Loader2 size={14} className="animate-spin" />
                Checking…
              </div>
            )}
            {outlook.state === "disconnected" && (
              <button
                onClick={connect}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-3.5 py-2 text-xs font-medium hover:bg-gray-800 transition disabled:opacity-50"
              >
                {busy ? "Starting…" : "Connect Outlook"}
                <ExternalLink size={12} />
              </button>
            )}
            {outlook.state === "connected" && (
              <>
                {outlook.status === "needs_reconnect" && (
                  <button
                    onClick={connect}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 text-white px-3.5 py-2 text-xs font-medium hover:bg-amber-600 transition disabled:opacity-50"
                  >
                    Reconnect
                  </button>
                )}
                <button
                  onClick={disconnect}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition disabled:opacity-50"
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: OutlookStatus }) {
  if (status.state === "loading") return null;
  if (status.state === "disconnected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
        Not connected
      </span>
    );
  }
  if (status.status === "needs_reconnect") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
        <AlertTriangle size={10} />
        Needs reconnect
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
      <CheckCircle2 size={10} />
      Connected
    </span>
  );
}
