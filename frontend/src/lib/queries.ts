import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { getSession } from "./auth";
import type { Chain, SnapshotSummary, TrackedSymbol } from "./types";

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
