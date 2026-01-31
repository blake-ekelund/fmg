import { useRef } from "react";

export function useDebouncedSave(delay = 500) {
  const timers = useRef<Record<string, NodeJS.Timeout>>({});

  function schedule(key: string, fn: () => Promise<void>) {
    if (timers.current[key]) {
      clearTimeout(timers.current[key]);
    }

    timers.current[key] = setTimeout(() => {
      fn().catch(() => {});
    }, delay);
  }

  return schedule;
}
