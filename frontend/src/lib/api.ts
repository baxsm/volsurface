import { env } from "./env";

// these mirror the codes the api actually puts on the wire. TOO_MANY_REQUESTS
// is the backend's own name for a 429 and has to match it exactly, or the body
// code lands outside this union and every check against it silently misses.
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL"
  | "NETWORK";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

const MESSAGES: Record<ApiErrorCode, string> = {
  BAD_REQUEST: "That request was not valid.",
  UNAUTHORIZED: "Sign in to continue.",
  FORBIDDEN: "You do not have access to that.",
  NOT_FOUND: "Not found.",
  CONFLICT: "That already exists.",
  TOO_MANY_REQUESTS: "Too many requests. Wait a moment and try again.",
  INTERNAL: "Something failed on our end. Try again.",
  NETWORK: "Could not reach the server. Check your connection and try again.",
};

const isErrorBody = (value: unknown): value is { error: { code: string; message: string } } =>
  typeof value === "object" &&
  value !== null &&
  "error" in value &&
  typeof (value as { error: unknown }).error === "object";

/** a code we do not recognise falls back to the status rather than being cast
    into the union, where it would leave every message lookup undefined */
const isKnownCode = (code: string): code is ApiErrorCode => code in MESSAGES;

const codeFromStatus = (status: number): ApiErrorCode => {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "TOO_MANY_REQUESTS";
  return "INTERNAL";
};

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * every backend call goes through here. credentials are always included because
 * auth is a session cookie, and errors always arrive as ApiError so callers
 * never have to tell a network failure apart from a 404 by hand.
 */
export const api = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = "GET", body, signal } = options;

  const init: RequestInit = { method, credentials: "include" };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  if (signal !== undefined) init.signal = signal;

  let response: Response;
  try {
    response = await fetch(`${env.VITE_API_URL}${path}`, init);
  } catch (cause) {
    // an aborted request is the caller's own cancellation, not a failure to show
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError("NETWORK", MESSAGES.NETWORK, 0);
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const code =
      isErrorBody(payload) && isKnownCode(payload.error.code)
        ? payload.error.code
        : codeFromStatus(response.status);
    const message = isErrorBody(payload) ? payload.error.message : MESSAGES[code];
    throw new ApiError(code, message || MESSAGES[code], response.status);
  }

  return payload as T;
};
