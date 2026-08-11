import { Check } from "lucide-react";
import type { FC } from "react";
import { PageShell } from "@/components/shell/page-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useSession, useSymbols } from "@/lib/queries";
import { useAppStore } from "@/lib/store";

export const SettingsPage: FC = () => {
  const session = useSession();
  const symbols = useSymbols();
  const ticker = useAppStore((s) => s.ticker);
  const setTicker = useAppStore((s) => s.setTicker);

  // this page used to render regardless of how its two queries went, so a dead
  // server showed a name of "-" and a symbol section that was simply empty -
  // indistinguishable from having no symbols. every other page guards this.
  if (symbols.isError || session.isError) {
    return (
      <ErrorState
        title="Could not load your settings"
        message="The server did not answer. Check that it is running and try again."
        onRetry={() => {
          void symbols.refetch();
          void session.refetch();
        }}
      />
    );
  }

  if (symbols.isPending || session.isPending) {
    return <LoadingState label="Loading your settings" rows={4} />;
  }

  const user = session.data?.user;

  return (
    <PageShell>
      <h1 className="text-lg tracking-tight">Settings</h1>

      <section className="mt-8 border-t border-border pt-6">
        <h2 className="text-xs tracking-wide text-text-faint uppercase">Account</h2>
        <dl className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-text-muted">Name</dt>
            <dd className="text-sm text-text">{user?.name ?? "-"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-text-muted">Email</dt>
            <dd className="num truncate text-sm text-text">{user?.email ?? "-"}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8 border-t border-border pt-6">
        <h2 className="text-xs tracking-wide text-text-faint uppercase">Default symbol</h2>
        <p className="mt-2 text-sm text-text-muted">
          The symbol the app opens on. Changing it here also changes the active symbol.
        </p>

        {symbols.data.length === 0 ? (
          <EmptyState
            title="No symbols yet"
            hint="Ingest a chain and the symbols it covers will be selectable here."
          />
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {symbols.data.map((symbol) => {
              const active = symbol.ticker === ticker;
              return (
                <button
                  key={symbol.ticker}
                  type="button"
                  onClick={() => setTicker(symbol.ticker)}
                  aria-pressed={active}
                  className={`num flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-1.5 text-sm transition-colors active:translate-y-px ${
                    active
                      ? "border-accent-dim bg-accent-glow text-accent"
                      : "border-border text-text-muted hover:border-border-strong hover:text-text"
                  }`}
                >
                  {/* selection was carried by colour alone before */}
                  <Check
                    size={14}
                    strokeWidth={2}
                    aria-hidden="true"
                    className={active ? "opacity-100" : "opacity-0"}
                  />
                  {symbol.ticker}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </PageShell>
  );
};
