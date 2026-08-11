import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { chainQuery, surfaceQuery } from "./queries";

/**
 * warms the other view of the snapshot the user is already looking at.
 *
 * chain and surface are two readings of one stored snapshot, and the app has no
 * server render to hydrate from, so the cache is warmed on the client instead:
 * whichever view is open pulls the other in the background, and switching route
 * then renders from cache instead of waiting on the network. measured before
 * this existed, surface -> chain cost 390ms and a cold fetch of all 2444
 * contracts; chain -> build was already 110ms with no fetch at all, because
 * build reuses the chain the previous route had cached. this gives the first
 * hop the same treatment.
 *
 * prefetchQuery is a no-op when the entry is already fresh, so this does not
 * re-request on every render or fight the 5 minute staleTime.
 */
export const usePrefetchSnapshot = (snapshotId: string | null, also: "chain" | "surface"): void => {
  const client = useQueryClient();

  useEffect(() => {
    if (snapshotId === null) return;

    // idle time, not render time: the visible view's own data matters more than
    // the one the user has not asked for yet, and on a slow connection racing
    // them makes the current page slower to be useful.
    // the two branches are called separately rather than through a ternary: a
    // ternary widens both query descriptors to one union and typescript then
    // cannot match either queryFn to its own key
    const run = () => {
      if (also === "chain") void client.prefetchQuery(chainQuery(snapshotId));
      else void client.prefetchQuery(surfaceQuery(snapshotId));
    };

    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(run, { timeout: 2_000 });
      return () => cancelIdleCallback(handle);
    }

    const timer = setTimeout(run, 400);
    return () => clearTimeout(timer);
  }, [client, snapshotId, also]);
};
