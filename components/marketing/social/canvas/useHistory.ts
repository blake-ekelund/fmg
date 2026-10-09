"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Undo/redo for a value. `set(next, key)` records a step; consecutive sets
 * with the same key within 800 ms merge into one step, so typing a word or
 * dragging a slider is one undo, not fifty.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<{ past: T[]; present: T; future: T[] }>({ past: [], present: initial, future: [] });
  const last = useRef<{ key: string; at: number } | null>(null);

  const set = useCallback((next: T | ((cur: T) => T), key?: string) => {
    setState((s) => {
      const value = typeof next === "function" ? (next as (c: T) => T)(s.present) : next;
      if (Object.is(value, s.present)) return s;
      const now = Date.now();
      const merge = !!key && last.current?.key === key && now - last.current.at < 800;
      last.current = key ? { key, at: now } : null;
      return {
        past: merge ? s.past : [...s.past, s.present].slice(-100),
        present: value,
        future: [],
      };
    });
  }, []);

  /** Replace the value without an undo step (loading, conversion). */
  const reset = useCallback((value: T) => {
    last.current = null;
    setState({ past: [], present: value, future: [] });
  }, []);

  const undo = useCallback(() => {
    last.current = null;
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    last.current = null;
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  return { value: state.present, set, reset, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
