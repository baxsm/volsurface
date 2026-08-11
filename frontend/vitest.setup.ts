import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom implements neither, and motion plus the chain's atm centring both call
// them on mount. without these every render throws instead of failing on the
// thing under test.
// the guard tests for a callable, not for the key: jsdom declares matchMedia
// but leaves it undefined, so an `in` check passes and the polyfill never
// installs - which only surfaced when a component outside the chain page
// started calling it
if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

if (!("ResizeObserver" in window)) {
  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}

Element.prototype.scrollIntoView = vi.fn();
