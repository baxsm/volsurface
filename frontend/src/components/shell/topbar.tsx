import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { type FC, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { signOut } from "@/lib/auth";
import { longDate, money, shortDate } from "@/lib/format";
import { sessionKey, useSession } from "@/lib/queries";
import { useAppStore } from "@/lib/store";
import { useActiveSnapshot } from "@/lib/use-active-snapshot";

const Dropdown: FC<{
  label: string;
  value: string;
  sub?: string;
  disabled?: boolean;
  children: (close: () => void) => React.ReactNode;
}> = ({ label, value, sub, disabled = false, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${label}: ${value}`}
        className="flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface-2 px-2.5 py-1.5 text-left whitespace-nowrap transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2.5 sm:px-3"
      >
        <span className="hidden text-xs text-text-faint lg:inline">{label}</span>
        <span className="num text-sm text-text">{value}</span>
        {sub !== undefined && <span className="text-xs text-text-muted">{sub}</span>}
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`text-text-faint transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="scrollbar-thin absolute left-0 z-50 mt-1.5 max-h-80 w-60 overflow-y-auto rounded-sm border border-border-strong bg-surface shadow-2xl shadow-black/50"
          >
            <ul>{children(() => setOpen(false))}</ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const Topbar: FC<{ onOpenNav: () => void }> = ({ onOpenNav }) => {
  const { ticker, symbols, snapshots, activeSnapshot } = useActiveSnapshot();
  const setTicker = useAppStore((s) => s.setTicker);
  const setSnapshotId = useAppStore((s) => s.setSnapshotId);
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      queryClient.setQueryData(sessionKey, null);
      await queryClient.invalidateQueries();
      await navigate("/sign-in");
    } finally {
      setSigningOut(false);
    }
  };

  const snapshotList = snapshots.data ?? [];

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 overflow-hidden border-b border-border bg-surface px-3 sm:gap-3 sm:px-4">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="-ml-1 cursor-pointer rounded-sm p-2 text-text-muted transition-colors hover:text-text md:hidden"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M2 4h12M2 8h12M2 12h12" />
        </svg>
      </button>

      <Dropdown
        label="Symbol"
        value={ticker ?? "-"}
        disabled={symbols.data === undefined || symbols.data.length === 0}
      >
        {(close) =>
          (symbols.data ?? []).map((symbol) => (
            <li key={symbol.ticker}>
              <button
                type="button"
                aria-current={symbol.ticker === ticker}
                onClick={() => {
                  setTicker(symbol.ticker);
                  close();
                }}
                className={`flex w-full cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-surface-2 ${
                  symbol.ticker === ticker ? "text-accent" : "text-text"
                }`}
              >
                <span className="num text-sm">{symbol.ticker}</span>
                <span className="truncate text-xs text-text-muted">{symbol.name}</span>
              </button>
            </li>
          ))
        }
      </Dropdown>

      <Dropdown
        label="Snapshot"
        value={activeSnapshot === undefined ? "-" : shortDate(activeSnapshot.tradeDate)}
        disabled={snapshotList.length === 0}
      >
        {(close) =>
          snapshotList.map((snapshot) => (
            <li key={snapshot.id}>
              <button
                type="button"
                aria-current={snapshot.id === activeSnapshot?.id}
                onClick={() => {
                  setSnapshotId(snapshot.id);
                  close();
                }}
                className={`flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2 ${
                  snapshot.id === activeSnapshot?.id ? "text-accent" : "text-text"
                }`}
              >
                <span className="num text-sm">{longDate(snapshot.tradeDate)}</span>
                <span className="num text-xs text-text-faint">{snapshot.contractCount}</span>
              </button>
            </li>
          ))
        }
      </Dropdown>

      {activeSnapshot?.underlyingPrice != null && (
        <div className="hidden items-baseline gap-2 border-l border-border pl-3 sm:flex">
          <span className="text-xs text-text-faint">Spot</span>
          <span className="num text-sm text-text">{money(activeSnapshot.underlyingPrice)}</span>
        </div>
      )}

      <div className="flex-1" />

      {session.data == null ? (
        <a
          href="/sign-in"
          className="rounded-sm border border-border-strong px-3 py-1.5 text-sm text-text transition-colors hover:border-accent-dim hover:text-accent"
        >
          Sign in
        </a>
      ) : (
        <div className="flex items-center gap-3">
          <span className="hidden max-w-40 truncate text-sm text-text-muted sm:inline">
            {session.data.user.email}
          </span>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="cursor-pointer rounded-sm border border-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-50"
          >
            {signingOut ? "Signing out" : "Sign out"}
          </button>
        </div>
      )}
    </header>
  );
};
