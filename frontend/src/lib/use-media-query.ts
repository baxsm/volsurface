import { useSyncExternalStore } from "react";

/**
 * table columns are structural, so the calls/puts split cannot be done with a
 * css breakpoint alone - the layout has to know the width. useSyncExternalStore
 * keeps the subscription correct without an effect that could read a stale
 * match after a resize.
 */
export const useMediaQuery = (query: string): boolean => {
  const subscribe = (onChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  };

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // no window during a server render or a test without jsdom: treat it as the
    // wide layout rather than guessing mobile
    () => false,
  );
};

/** below the shell's md breakpoint, where the rail collapses too */
export const useIsNarrow = (): boolean => useMediaQuery("(max-width: 767px)");
