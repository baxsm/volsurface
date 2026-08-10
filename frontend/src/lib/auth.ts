import { env } from "./env";
import type { Session } from "./types";

// better auth answers with a flat { message, code } rather than the { error: {} }
// shape the rest of our api uses, so it gets its own thin client instead of
// being forced through the generic one and mislabelled.
export class AuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

const FRIENDLY: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password do not match.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with that email already exists.",
  PASSWORD_TOO_SHORT: "Password must be at least 12 characters.",
};

const authFetch = async <T>(path: string, body?: unknown): Promise<T> => {
  const init: RequestInit = {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
  };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${env.VITE_API_URL}/api/auth${path}`, init);
  } catch {
    throw new AuthError("NETWORK", "Could not reach the server. Check your connection.");
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const flat = payload as { code?: string; message?: string } | null;
    const code = flat?.code ?? "UNKNOWN";
    if (response.status === 429) {
      throw new AuthError("TOO_MANY_REQUESTS", "Too many attempts. Wait a moment and try again.");
    }
    throw new AuthError(
      code,
      FRIENDLY[code] ?? flat?.message ?? "Could not complete that. Try again.",
    );
  }

  return payload as T;
};

export const getSession = (): Promise<Session | null> => authFetch<Session | null>("/get-session");

export const signIn = (input: { email: string; password: string }): Promise<unknown> =>
  authFetch("/sign-in/email", input);

export const signUp = (input: {
  email: string;
  password: string;
  name: string;
}): Promise<unknown> => authFetch("/sign-up/email", input);

export const signOut = (): Promise<unknown> => authFetch("/sign-out", {});
