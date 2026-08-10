import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppState {
  ticker: string | null;
  snapshotId: string | null;
  railCollapsed: boolean;
  showVendor: boolean;
  setTicker: (ticker: string) => void;
  setSnapshotId: (id: string) => void;
  toggleRail: () => void;
  setShowVendor: (show: boolean) => void;
}

/**
 * symbol and snapshot are global because the topbar drives every data view.
 * persisted so a reload keeps the user where they were, but the selection is
 * still validated against what the api actually returns before it is used.
 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ticker: null,
      snapshotId: null,
      railCollapsed: false,
      showVendor: false,
      setTicker: (ticker) => set({ ticker, snapshotId: null }),
      setSnapshotId: (snapshotId) => set({ snapshotId }),
      toggleRail: () => set((state) => ({ railCollapsed: !state.railCollapsed })),
      setShowVendor: (showVendor) => set({ showVendor }),
    }),
    {
      name: "volsurface-ui",
      partialize: (state) => ({
        ticker: state.ticker,
        snapshotId: state.snapshotId,
        railCollapsed: state.railCollapsed,
        showVendor: state.showVendor,
      }),
    },
  ),
);
