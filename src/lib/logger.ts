type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown> | undefined;

const SENSITIVE_KEY_PATTERN = /token|secret|password|authorization|cookie|email|subject|message|body|content|phone/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const redactString = (value: string): string => value.replace(EMAIL_PATTERN, "[REDACTED]");

const redactValue = (value: unknown, key?: string): unknown => {
  if (typeof value === "string") {
    if (key && SENSITIVE_KEY_PATTERN.test(key)) {
      return "[REDACTED]";
    }
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (isObject(value)) {
    return Object.entries(value).reduce<Record<string, unknown>>((acc, [k, v]) => {
      acc[k] = redactValue(v, k);
      return acc;
    }, {});
  }

  return value;
};

const sanitizeMeta = (meta: LogMeta): Record<string, unknown> | undefined => {
  if (!meta) return undefined;
  return Object.entries(meta).reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[key] = redactValue(value, key);
    return acc;
  }, {});
};

const baseLog = (level: LogLevel, message: string, meta?: LogMeta) => {
  const payload: Record<string, unknown> = {
    level,
    ts: new Date().toISOString(),
    msg: message,
  };

  const sanitizedMeta = sanitizeMeta(meta);
  if (sanitizedMeta && Object.keys(sanitizedMeta).length > 0) {
    payload.meta = sanitizedMeta;
  }

  console[level === "debug" ? "debug" : level === "info" ? "info" : level === "warn" ? "warn" : "error"](
    JSON.stringify(payload)
  );
};

export const logger = {
  debug: (message: string, meta?: LogMeta) => baseLog("debug", message, meta),
  info: (message: string, meta?: LogMeta) => baseLog("info", message, meta),
  warn: (message: string, meta?: LogMeta) => baseLog("warn", message, meta),
  error: (message: string, meta?: LogMeta) => baseLog("error", message, meta),
  child: (context: Record<string, unknown>) => ({
    debug: (message: string, meta?: LogMeta) => baseLog("debug", message, { ...context, ...meta }),
    info: (message: string, meta?: LogMeta) => baseLog("info", message, { ...context, ...meta }),
    warn: (message: string, meta?: LogMeta) => baseLog("warn", message, { ...context, ...meta }),
    error: (message: string, meta?: LogMeta) => baseLog("error", message, { ...context, ...meta }),
  }),
};

export type Logger = typeof logger;

export const serializeError = (error: unknown) =>
  error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) };
