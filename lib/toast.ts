/**
 * App-wide toasts — small notices in the corner that survive page changes
 * (rendered by components/ui/Toaster.tsx in the LayoutShell). Client-only.
 *
 *   const id = toast({ tone: "working", title: "Writing posts…", sticky: true });
 *   updateToast(id, { tone: "success", title: "Ready", action: { label: "Review", run: (go) => go("/x") } });
 */

import { useSyncExternalStore } from "react";

export type ToastTone = "success" | "error" | "info" | "working";

export type ToastAction = {
  label: string;
  /** `navigate` is the router's push, for actions that lead to a page. */
  run: (navigate: (href: string) => void) => void;
};

export type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  body?: string;
  action?: ToastAction;
  /** Stays until closed (or replaced). "working" toasts are always sticky. */
  sticky?: boolean;
};

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(t: Omit<Toast, "id">): string {
  const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  toasts = [...toasts, { ...t, id }];
  emit();
  return id;
}

/** Change a toast in place (e.g. "working" → "success"); re-shows it if it was closed. */
export function updateToast(id: string, patch: Partial<Omit<Toast, "id">>): void {
  const i = toasts.findIndex((t) => t.id === id);
  if (i < 0) {
    toasts = [...toasts, { tone: "info", title: "", ...patch, id }];
  } else {
    toasts = toasts.map((t) => (t.id === id ? { ...t, ...patch } : t));
  }
  emit();
}

export function dismissToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => toasts;
const empty: Toast[] = [];

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, snapshot, () => empty);
}
