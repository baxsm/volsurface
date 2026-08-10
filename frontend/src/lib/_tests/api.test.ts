import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../api";

const mockFetch = (impl: (url: string, init: RequestInit) => Promise<Response> | Response) => {
  vi.stubGlobal("fetch", vi.fn(impl));
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api", () => {
  it("returns the parsed body on success", async () => {
    mockFetch(() => json({ symbols: [{ ticker: "IBM" }] }));
    await expect(api("/api/symbols")).resolves.toEqual({ symbols: [{ ticker: "IBM" }] });
  });

  it("always sends credentials so the session cookie travels", async () => {
    const spy = vi.fn((_url: string, _init: RequestInit) => json({}));
    mockFetch(spy);
    await api("/api/symbols");
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("sends no content-type on a bodyless request", async () => {
    const spy = vi.fn((_url: string, _init: RequestInit) => json({}));
    mockFetch(spy);
    await api("/api/symbols");
    expect(spy.mock.calls[0]?.[1].headers).toBeUndefined();
  });

  it("returns undefined for a 204", async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(api("/api/strategies/x", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("carries the backend code and message through", async () => {
    mockFetch(() => json({ error: { code: "NOT_FOUND", message: "Snapshot not found." } }, 404));
    await expect(api("/api/snapshots/x/chain")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Snapshot not found.",
      status: 404,
    });
  });

  it("falls back to a status-derived code when the body is not our shape", async () => {
    mockFetch(() => new Response("gateway down", { status: 502 }));
    const error = await api("/api/symbols").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("INTERNAL");
  });

  it("maps a 429 to a rate limit the ui can explain", async () => {
    mockFetch(() => new Response(null, { status: 429 }));
    await expect(api("/api/price/iv", { method: "POST", body: {} })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  // a dead server and a 404 must not read the same to the user
  it("reports an unreachable server as a network fault", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(api("/api/symbols")).rejects.toMatchObject({ code: "NETWORK", status: 0 });
  });

  it("lets an abort through rather than dressing it as a failure", async () => {
    mockFetch(() => Promise.reject(new DOMException("aborted", "AbortError")));
    await expect(api("/api/symbols")).rejects.toBeInstanceOf(DOMException);
  });
});
