type LogLevel = "error" | "warn" | "info" | "debug";

const PRIORITY: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

const configuredLevel = (): LogLevel => {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  return raw && raw in PRIORITY ? (raw as LogLevel) : "info";
};

const shouldLog = (level: LogLevel): boolean => PRIORITY[level] <= PRIORITY[configuredLevel()];

const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();

const formatDetails = (data: unknown): string => {
  if (Array.isArray(data)) return `Details: ${collapse(data.join(" | "))}`;
  if (data instanceof Error) return `${data.name}: ${collapse(data.message)}`;
  if (typeof data === "object" && data !== null) {
    const pairs = Object.entries(data)
      .map(([key, value]) => `${key}: ${collapse(String(value))}`)
      .join(" | ");
    return `Details: ${pairs}`;
  }
  return `Details: ${collapse(String(data))}`;
};

const emit = (level: LogLevel, path: string, data: unknown): void => {
  if (!shouldLog(level)) return;
  const line = `[${level.toUpperCase()}] Path: ${path} | ${formatDetails(data)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.info(line);
};

export const logger = {
  error: (path: string, data: unknown) => emit("error", path, data),
  warn: (path: string, data: unknown) => emit("warn", path, data),
  info: (path: string, data: unknown) => emit("info", path, data),
  debug: (path: string, data: unknown) => emit("debug", path, data),
};
