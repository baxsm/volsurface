import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { isProduction } from "@/env";
import { logger } from "./logger";

export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}

/** thrown inside services to reject a request with a specific status */
export class ApiError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  BAD_REQUEST: "Check the request and try again.",
  UNAUTHORIZED: "Sign in to continue.",
  FORBIDDEN: "You do not have access to this.",
  NOT_FOUND: "Not found.",
  CONFLICT: "That already exists.",
  TOO_MANY_REQUESTS: "Too many requests. Wait a moment and try again.",
  INTERNAL: "Something failed on our end. Try again.",
};

// connection strings, keys and file paths turn up in driver errors. anything
// unrecognised is replaced wholesale rather than pattern-scrubbed, because a
// partial scrub still leaks the parts the pattern missed.
const SENSITIVE = /postgres:\/\/|redis:\/\/|password|secret|token|api[_-]?key|[a-z]:\\|\/home\//i;

export const sanitizeErrorMessage = (code: ErrorCode, message: string): string => {
  if (message.length === 0) return DEFAULT_MESSAGE[code];
  if (SENSITIVE.test(message)) return DEFAULT_MESSAGE[code];
  // never surface internal failure detail to a client, even when it looks safe
  if (code === "INTERNAL" && isProduction) return DEFAULT_MESSAGE[code];
  return message;
};

export const errorResponse = (c: Context, code: ErrorCode, message?: string) => {
  const body: ApiErrorBody = {
    error: { code, message: sanitizeErrorMessage(code, message ?? "") },
  };
  return c.json(body, ERROR_STATUS[code] as ContentfulStatusCode);
};

/**
 * wraps a handler so a thrown ApiError becomes its status and anything else
 * becomes a logged 500. without this every handler repeats the same try/catch
 * and one missed catch leaks a stack trace to the client.
 */
export const handle =
  <T extends Context>(path: string, fn: (c: T) => Promise<Response> | Response) =>
  async (c: T): Promise<Response> => {
    const started = performance.now();
    try {
      return await fn(c);
    } catch (error) {
      if (error instanceof ApiError) {
        logger.warn(path, `${error.code}: ${error.message}`);
        return errorResponse(c, error.code, error.message);
      }
      logger.error(path, error);
      return errorResponse(c, "INTERNAL");
    } finally {
      if (!isProduction) {
        const elapsed = performance.now() - started;
        if (elapsed > 250) logger.debug(path, `slow: ${elapsed.toFixed(0)}ms`);
      }
    }
  };
