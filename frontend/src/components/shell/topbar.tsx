import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, LogIn, LogOut, Menu } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type FC, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Spinner } from "@/components/ui/states";
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
  const reduced = useReducedMotion();

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
        className="flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface-2 px-2.5 py-1.5 text-left whitespace-nowrap transition-colors hover:border-border-strong active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0 sm:gap-2.5 sm:px-3"
      >
        <span className="hidden text-xs text-text-faint lg:inline">{label}</span>
        <span className="num text-sm text-text">{value}</span>
        {sub !== undefined && <span className="text-xs text-text-muted">{sub}</span>}
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          aria-hidden="true"
          className={`text-text-faint transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            // the global reduced-motion css cannot reach a js-driven translate,
            // so the travel is dropped here the way the drawer and panel do it
            initial={reduced === true ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced === true ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: reduced === true ? 0 : 0.14 }}
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
    /* the header must not clip: the symbol and snapshot menus open downward out
       of it, and an overflow-hidden ancestor cuts them off whatever their
       z-index. the pieces that can actually overrun bound themselves instead,
       via min-w-0 and truncate on the email below. */
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:gap-3 sm:px-4">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="-ml-1 cursor-pointer rounded-sm p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text active:translate-y-px md:hidden"
      >
        <Menu size={18} strokeWidth={1.4} aria-hidden="true" />
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
                className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2 ${
                  symbol.ticker === ticker ? "text-accent" : "text-text"
                }`}
              >
                {/* the tick carries the selection, so it does not rest on colour
                    alone the way it used to */}
                <Check
                  size={14}
                  strokeWidth={2}
                  aria-hidden="true"
                  className={`shrink-0 ${symbol.ticker === ticker ? "opacity-100" : "opacity-0"}`}
                />
                <span className="flex min-w-0 flex-col items-start gap-0.5">
                  <span className="num text-sm">{symbol.ticker}</span>
                  <span className="truncate text-xs text-text-muted">{symbol.name}</span>
                </span>
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
                className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2 ${
                  snapshot.id === activeSnapshot?.id ? "text-accent" : "text-text"
                }`}
              >
                <Check
                  size={14}
                  strokeWidth={2}
                  aria-hidden="true"
                  className={`shrink-0 ${
                    snapshot.id === activeSnapshot?.id ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span className="num flex-1 text-sm">{longDate(snapshot.tradeDate)}</span>
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
        /* a Link, not an anchor: an href here reloaded the whole app to reach a
           route the router already owns */
        <Link
          to="/sign-in"
          className="flex shrink-0 cursor-pointer items-center gap-2 rounded-sm border border-border-strong px-3 py-1.5 text-sm text-text transition-colors hover:border-accent-dim hover:text-accent active:translate-y-px"
        >
          <LogIn size={14} strokeWidth={1.5} aria-hidden="true" />
          Sign in
        </Link>
      ) : (
        <div className="flex min-w-0 items-center gap-3">
          {/* the email yields first: it can be any length, and letting it push
              the sign out button off the edge is worse than truncating it. only
              from lg, because at tablet width the rail already takes the room. */}
          <span className="hidden min-w-0 max-w-40 truncate text-sm text-text-muted lg:inline">
            {session.data.user.email}
          </span>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            aria-busy={signingOut}
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-sm border border-border px-3 py-1.5 text-sm whitespace-nowrap text-text-muted transition-colors hover:border-border-strong hover:text-text active:translate-y-px disabled:opacity-50 disabled:active:translate-y-0"
          >
            {signingOut ? <Spinner /> : <LogOut size={14} strokeWidth={1.5} aria-hidden="true" />}
            {signingOut ? "Signing out" : "Sign out"}
          </button>
        </div>
      )}
    </header>
  );
};
