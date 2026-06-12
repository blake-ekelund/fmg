type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type Logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
};

export function createLogger(minLevel: Level = "info"): Logger {
  const threshold = LEVEL_ORDER[minLevel];

  function log(level: Level, msg: string, meta?: Record<string, unknown>) {
    if (LEVEL_ORDER[level] < threshold) return;
    const ts = new Date().toISOString();
    const payload = meta ? ` ${JSON.stringify(meta)}` : "";
    const line = `${ts} [${level.toUpperCase()}] ${msg}${payload}`;
    (level === "error" ? console.error : console.log)(line);
  }

  return {
    debug: (m, meta) => log("debug", m, meta),
    info: (m, meta) => log("info", m, meta),
    warn: (m, meta) => log("warn", m, meta),
    error: (m, meta) => log("error", m, meta),
  };
}
