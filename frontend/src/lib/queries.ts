import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { getSession } from "./auth";
import type { PayoffResult, StrategyLeg } from "./strategy";
import { toPayloadLegs } from "./strategy";
import type {
  Chain,
  SavedStrategy,
  SavedStrategySummary,
  SnapshotSummary,
  Surface,
  TrackedSymbol,
} from "./types";

export const sessionKey = ["session"] as const;

export const useSession = () =>
  useQuery({
    queryKey: sessionKey,
    queryFn: () => getSession(),
    staleTime: 60_000,
    retry: false,
  });

export const useSymbols = () =>
  useQuery({
    queryKey: ["symbols"],
    queryFn: () => api<{ symbols: TrackedSymbol[] }>("/api/symbols").then((r) => r.symbols),
    staleTime: 5 * 60_000,
  });

export const useSnapshots = (ticker: string | null) =>
  useQuery({
    queryKey: ["snapshots", ticker],
    queryFn: () =>
      api<{ snapshots: SnapshotSummary[] }>(`/api/symbols/${ticker}/snapshots`).then(
        (r) => r.snapshots,
      ),
    enabled: ticker !== null,
    staleTime: 5 * 60_000,
  });

/**
 * chain and surface are described once and shared by the hook and the prefetch.
 * a prefetch that passes a different key or staleTime than its hook writes a
 * cache entry the hook never reads, which looks like it works and warms
 * nothing, so there is deliberately only one definition of each.
 */
export const chainQuery = (snapshotId: string) => ({
  queryKey: ["chain", snapshotId] as const,
  queryFn: () => api<Chain>(`/api/snapshots/${snapshotId}/chain`),
  staleTime: 5 * 60_000,
});

export const surfaceQuery = (snapshotId: string) => ({
  queryKey: ["surface", snapshotId] as const,
  queryFn: () => api<Surface>(`/api/snapshots/${snapshotId}/surface`),
  staleTime: 5 * 60_000,
});

// the id is only null while the snapshot list is still resolving, and `enabled`
// keeps queryFn from running until it is not. the empty string never reaches the
// network, it just keeps the key shape identical to the prefetch's.
export const useChain = (snapshotId: string | null) =>
  useQuery({ ...chainQuery(snapshotId ?? ""), enabled: snapshotId !== null });

export const useSurface = (snapshotId: string | null) =>
  useQuery({ ...surfaceQuery(snapshotId ?? ""), enabled: snapshotId !== null });

export const strategiesKey = ["strategies"] as const;

/**
 * shorter than the chain's five minutes: this list is the user's own writes, so
 * it should follow a save made in another tab reasonably soon. it is not zero
 * because every mutation here already invalidates the key, which means a save or
 * a delete in this tab refreshes it immediately regardless.
 */
const OWNED_STALE_TIME = 30_000;

export const useStrategies = (enabled: boolean) =>
  useQuery({
    queryKey: strategiesKey,
    queryFn: () =>
      api<{ strategies: SavedStrategySummary[] }>("/api/strategies").then((r) => r.strategies),
    enabled,
    staleTime: OWNED_STALE_TIME,
  });

export const useStrategy = (id: string | null) =>
  useQuery({
    queryKey: ["strategy", id],
    queryFn: () => api<SavedStrategy>(`/api/strategies/${id}`),
    enabled: id !== null,
    staleTime: OWNED_STALE_TIME,
  });

export interface SaveStrategyInput {
  id?: string;
  name: string;
  kind: string;
  ticker?: string;
  legs: StrategyLeg[];
}

/** create and update share a payload, so one hook covers save and re-save
    rather than two that could drift apart */
export const useSaveStrategy = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name, kind, ticker, legs }: SaveStrategyInput) => {
      const body = {
        name,
        kind,
        ...(ticker === undefined ? {} : { ticker }),
        legs: toPayloadLegs(legs),
      };
      return id === undefined
        ? api<SavedStrategy>("/api/strategies", { method: "POST", body })
        : api<SavedStrategy>(`/api/strategies/${id}`, { method: "PUT", body });
    },
    onSuccess: async (saved) => {
      await client.invalidateQueries({ queryKey: strategiesKey });
      client.setQueryData(["strategy", saved.id], saved);
    },
  });
};

export const useDeleteStrategy = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/strategies/${id}`, { method: "DELETE" }),
    onSuccess: async (_result, id) => {
      client.removeQueries({ queryKey: ["strategy", id] });
      await client.invalidateQueries({ queryKey: strategiesKey });
    },
  });
};

export interface PayoffRequest {
  legs: StrategyLeg[];
  spotRange: { min: number; max: number };
}

export const fetchPayoff = (request: PayoffRequest, signal?: AbortSignal) =>
  api<PayoffResult>("/api/strategy/payoff", {
    method: "POST",
    body: { legs: toPayloadLegs(request.legs), spotRange: request.spotRange },
    ...(signal === undefined ? {} : { signal }),
  });
