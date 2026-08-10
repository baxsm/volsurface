import type { FC } from "react";
import { useSession, useSymbols } from "@/lib/queries";
import { useAppStore } from "@/lib/store";

export const SettingsPage: FC = () => {
  const session = useSession();
  const symbols = useSymbols();
  const ticker = useAppStore((s) => s.ticker);
  const setTicker = useAppStore((s) => s.setTicker);

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h2 className="text-lg tracking-tight">Settings</h2>

        <section className="mt-8 border-t border-border pt-6">
          <h3 className="text-sm text-text">Account</h3>
          <dl className="mt-4 space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-text-muted">Name</dt>
              <dd className="text-sm text-text">{session.data?.user.name ?? "-"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-text-muted">Email</dt>
              <dd className="num truncate text-sm text-text">{session.data?.user.email ?? "-"}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-8 border-t border-border pt-6">
          <h3 className="text-sm text-text">Default symbol</h3>
          <p className="mt-1 text-sm text-text-muted">
            The symbol the app opens on. Changing it here also changes the active symbol.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(symbols.data ?? []).map((symbol) => (
              <button
                key={symbol.ticker}
                type="button"
                onClick={() => setTicker(symbol.ticker)}
                aria-pressed={symbol.ticker === ticker}
                className={`num cursor-pointer rounded-sm border px-3 py-1.5 text-sm transition-colors ${
                  symbol.ticker === ticker
                    ? "border-accent-dim bg-accent-glow text-accent"
                    : "border-border text-text-muted hover:border-border-strong hover:text-text"
                }`}
              >
                {symbol.ticker}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
