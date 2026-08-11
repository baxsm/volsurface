import { Check } from "lucide-react";
import type { FC, ReactNode } from "react";
import { PageShell } from "@/components/shell/page-shell";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { longDate } from "@/lib/format";
import { useSession, useSnapshots, useSymbols } from "@/lib/queries";
import { useAppStore } from "@/lib/store";

/**
 * one settings group: its name and purpose on the left, the controls on the
 * right. the label column is what keeps a short section from reading as an
 * abandoned line of text floating in an empty page, and it gives every setting
 * somewhere to explain itself rather than relying on the control's own wording.
 */
const Section: FC<{ title: string; hint: string; children: ReactNode }> = ({
  title,
  hint,
  children,
}) => (
  <section className="grid gap-x-10 gap-y-4 border-t border-border py-8 md:grid-cols-[16rem_1fr]">
    <div>
      <h2 className="text-sm text-text">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">{hint}</p>
    </div>
    <div className="min-w-0">{children}</div>
  </section>
);

const Field: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
    <dt className="text-sm text-text-muted">{label}</dt>
    <dd className="min-w-0 text-sm text-text">{children}</dd>
  </div>
);

export const SettingsPage: FC = () => {
  const session = useSession();
  const symbols = useSymbols();
  const ticker = useAppStore((s) => s.ticker);
  const setTicker = useAppStore((s) => s.setTicker);
  const snapshots = useSnapshots(ticker);

  // this page used to render regardless of how its queries went, so a dead
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
  const stored = snapshots.data ?? [];
  const latest = stored[0];
  const contracts = stored.reduce((total, snapshot) => total + snapshot.contractCount, 0);

  return (
    <PageShell>
      <div className="mb-2">
        <h1 className="text-lg tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">Your account, and what the app opens on.</p>
      </div>

      <Section title="Account" hint="The account these saved strategies belong to.">
        <dl className="divide-y divide-border">
          <Field label="Name">{user?.name ?? "-"}</Field>
          <Field label="Email">
            <span className="num truncate">{user?.email ?? "-"}</span>
          </Field>
        </dl>
      </Section>

      <Section
        title="Default symbol"
        hint="The symbol the app opens on. Changing it here also changes the symbol you are looking at now."
      >
        {symbols.data.length === 0 ? (
          <p className="text-sm text-text-muted">
            No symbols yet. Ingest a chain and it will be selectable here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {symbols.data.map((symbol) => {
              const active = symbol.ticker === ticker;
              return (
                <button
                  key={symbol.ticker}
                  type="button"
                  onClick={() => setTicker(symbol.ticker)}
                  aria-pressed={active}
                  className={`flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-2 text-left transition-colors active:translate-y-px ${
                    active
                      ? "border-accent-dim bg-accent-glow"
                      : "border-border hover:border-border-strong"
                  }`}
                >
                  {/* selection was carried by colour alone before */}
                  <Check
                    size={14}
                    strokeWidth={2}
                    aria-hidden="true"
                    className={`shrink-0 ${active ? "text-accent opacity-100" : "opacity-0"}`}
                  />
                  <span className="min-w-0">
                    <span
                      className={`num block text-sm ${active ? "text-accent" : "text-text-muted"}`}
                    >
                      {symbol.ticker}
                    </span>
                    <span className="block truncate text-xs text-text-faint">{symbol.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="Stored data"
        hint="Chains are stored as dated snapshots. Every price and greek in the app is read from one of these, never from a live quote."
      >
        {snapshots.isPending ? (
          <p className="text-sm text-text-muted">Loading snapshots</p>
        ) : stored.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nothing stored for {ticker ?? "this symbol"} yet.
          </p>
        ) : (
          <dl className="divide-y divide-border">
            <Field label="Snapshots">
              <span className="num">{stored.length}</span>
            </Field>
            <Field label="Contracts">
              <span className="num">{contracts.toLocaleString("en-US")}</span>
            </Field>
            {latest !== undefined && (
              <Field label="Most recent">
                <span className="num">{longDate(latest.tradeDate)}</span>
              </Field>
            )}
          </dl>
        )}
      </Section>
    </PageShell>
  );
};
