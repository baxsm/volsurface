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

export const useChain = (snapshotId: string | null) =>
  useQuery({
    queryKey: ["chain", snapshotId],
    queryFn: () => api<Chain>(`/api/snapshots/${snapshotId}/chain`),
    enabled: snapshotId !== null,
    staleTime: 5 * 60_000,
  });

export const useSurface = (snapshotId: string | null) =>
  useQuery({
    queryKey: ["surface", snapshotId],
    queryFn: () => api<Surface>(`/api/snapshots/${snapshotId}/surface`),
    enabled: snapshotId !== null,
    staleTime: 5 * 60_000,
  });

export const strategiesKey = ["strategies"] as const;

export const useStrategies = (enabled: boolean) =>
  useQuery({
    queryKey: strategiesKey,
    queryFn: () =>
      api<{ strategies: SavedStrategySummary[] }>("/api/strategies").then((r) => r.strategies),
    enabled,
  });

export const useStrategy = (id: string | null) =>
  useQuery({
    queryKey: ["strategy", id],
    queryFn: () => api<SavedStrategy>(`/api/strategies/${id}`),
    enabled: id !== null,
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
