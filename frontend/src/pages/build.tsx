import { type FC, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { LegEditor, SELECT_CELL } from "@/components/build/leg-editor";
import { PayoffChart } from "@/components/build/payoff-chart";
import { PayoffMetrics } from "@/components/build/payoff-metrics";
import { PresetPicker } from "@/components/build/preset-picker";
import { SaveStrategyForm } from "@/components/build/save-strategy-form";
import { PageShell } from "@/components/shell/page-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { ApiError } from "@/lib/api";
import { shortDate } from "@/lib/format";
import { useChain, useSession, useStrategy } from "@/lib/queries";
import {
  buildPreset,
  findGroup,
  makeLeg,
  PRESETS,
  type PresetId,
  type StrategyLeg,
} from "@/lib/strategy";
import { useActiveSnapshot } from "@/lib/use-active-snapshot";
import { usePayoff } from "@/lib/use-payoff";

const MAX_LEGS = 12;

export const BuildPage: FC = () => {
  const { snapshotId, symbols, snapshots, ticker } = useActiveSnapshot();
  const chain = useChain(snapshotId);
  const session = useSession();
  const navigate = useNavigate();

  const [params, setParams] = useSearchParams();
  const loadId = params.get("strategy");
  const saved = useStrategy(loadId);

  const [legs, setLegs] = useState<StrategyLeg[]>([]);
  const [preset, setPreset] = useState<PresetId | null>(null);
  const [expiration, setExpiration] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const groups = useMemo(() => chain.data?.expirations ?? [], [chain.data]);
  const expirations = useMemo(() => groups.map((group) => group.expiration), [groups]);
  const spot = chain.data?.snapshot.underlyingPrice ?? null;

  // the working expiry follows the chain, falling back to the front month when
  // the stored one is not in this snapshot
  useEffect(() => {
    if (groups.length === 0) return;
    if (groups.some((group) => group.expiration === expiration)) return;
    setExpiration(groups[0]?.expiration ?? null);
  }, [groups, expiration]);

  const group = findGroup(chain.data, expiration);

  // a saved strategy opens exactly as it was stored, so its own legs win over
  // any preset. it loads once per id rather than on every render of the query.
  useEffect(() => {
    if (saved.data === undefined || saved.data.id === loadedId) return;
    setLegs(
      saved.data.legs.map((leg) =>
        makeLeg({
          action: leg.action,
          type: leg.type,
          strike: leg.strike,
          expiration: leg.expiration,
          quantity: leg.quantity,
          entryPrice: leg.entryPrice ?? 0,
        }),
      ),
    );
    setPreset(null);
    setLoadedId(saved.data.id);
    const first = saved.data.legs[0];
    if (first !== undefined) setExpiration(first.expiration);
  }, [saved.data, loadedId]);

  // an unsaved builder opens on a real position rather than an empty table
  useEffect(() => {
    if (loadId !== null || legs.length > 0 || group === undefined || spot === null) return;
    const built = buildPreset("vertical-call-debit", { group, spot });
    if (built === null) return;
    setLegs(built);
    setPreset("vertical-call-debit");
  }, [loadId, legs.length, group, spot]);

  const pickPreset = useCallback(
    (id: PresetId) => {
      if (group === undefined || spot === null) return;
      const built = buildPreset(id, { group, spot });
      if (built === null) return;
      setLegs(built);
      setPreset(id);
      // a preset replaces whatever was loaded, so the builder is no longer
      // editing that saved strategy
      setLoadedId(null);
      if (loadId !== null) {
        params.delete("strategy");
        setParams(params, { replace: true });
      }
    },
    [group, spot, loadId, params, setParams],
  );

  const changeLeg = useCallback((id: string, patch: Partial<StrategyLeg>) => {
    setLegs((current) => current.map((leg) => (leg.id === id ? { ...leg, ...patch } : leg)));
    setPreset(null);
  }, []);

  const removeLeg = useCallback((id: string) => {
    setLegs((current) => (current.length <= 1 ? current : current.filter((leg) => leg.id !== id)));
    setPreset(null);
  }, []);

  const addLeg = useCallback(() => {
    setLegs((current) => {
      if (current.length >= MAX_LEGS) return current;
      const last = current[current.length - 1];
      if (last === undefined) return current;
      return [...current, makeLeg({ ...last, quantity: 1 })];
    });
    setPreset(null);
  }, []);

  const { payoff, error: payoffError, stale } = usePayoff(legs, spot);

  if (symbols.isError || snapshots.isError) {
    return (
      <ErrorState
        title="Could not load symbols"
        message="The server did not answer. Check that it is running and try again."
        onRetry={() => {
          void symbols.refetch();
          void snapshots.refetch();
        }}
      />
    );
  }

  if (symbols.isPending || snapshots.isPending) {
    return <LoadingState label="Loading symbols" rows={4} />;
  }

  if (snapshotId === null) {
    return (
      <EmptyState
        title="No snapshots yet"
        hint="A strategy is built against a chain. Ingest a snapshot for this symbol first."
      />
    );
  }

  if (chain.isPending) return <LoadingState label="Loading chain" rows={10} />;

  if (chain.isError) {
    return (
      <ErrorState
        title="Could not load the chain"
        message={
          chain.error instanceof ApiError
            ? chain.error.message
            : "The chain could not be loaded. Try again."
        }
        onRetry={() => void chain.refetch()}
      />
    );
  }

  if (saved.isError) {
    // a missing strategy will not appear on a retry, so that case offers a way
    // back to an empty builder instead of a button that repeats the same 404
    const missing = saved.error instanceof ApiError && saved.error.status === 404;
    return (
      <ErrorState
        title="Could not open that strategy"
        message={
          missing
            ? "That strategy does not exist, or it belongs to another account."
            : "The strategy could not be loaded. Try again."
        }
        onRetry={
          missing
            ? () => {
                setLoadedId(null);
                void navigate("/build", { replace: true });
              }
            : () => void saved.refetch()
        }
        retryLabel={missing ? "Start a new position" : "Try again"}
      />
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        title="This snapshot has no contracts"
        hint="A strategy needs quotes to price its legs. Pick another date."
      />
    );
  }

  const presetLabel = PRESETS.find((entry) => entry.id === preset)?.summary ?? null;

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg tracking-tight">
            {saved.data === undefined ? "Strategy builder" : saved.data.name}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Legs are priced at the marks in this snapshot. Profit is per contract at expiry.
          </p>
        </div>
        {expirations.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-text-muted">
            Expiry
            <select
              value={expiration ?? ""}
              onChange={(event) => setExpiration(event.target.value)}
              className={`${SELECT_CELL} num w-auto`}
            >
              {expirations.map((value) => (
                <option key={value} value={value}>
                  {shortDate(value)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <section className="mt-6 border-t border-border pt-5">
        <h3 className="text-xs tracking-wide text-text-faint uppercase">Preset</h3>
        <div className="mt-3">
          <PresetPicker
            active={preset}
            disabled={group === undefined || spot === null}
            onPick={pickPreset}
          />
        </div>
        <p className="mt-2 h-4 text-xs text-text-faint">{presetLabel}</p>
      </section>

      <section className="mt-6 border-t border-border pt-5">
        <h3 className="text-xs tracking-wide text-text-faint uppercase">Legs</h3>
        <div className="mt-3">
          <LegEditor
            legs={legs}
            expirations={expirations}
            maxLegs={MAX_LEGS}
            onChange={changeLeg}
            onRemove={removeLeg}
            onAdd={addLeg}
          />
        </div>
      </section>

      <section className="mt-6 border-t border-border pt-5">
        <h3 className="text-xs tracking-wide text-text-faint uppercase">Payoff at expiry</h3>

        {payoffError !== null ? (
          <div className="mt-3">
            <ErrorState title="Could not price this position" message={payoffError} />
          </div>
        ) : payoff === null ? (
          <div className="mt-3">
            <LoadingState label="Pricing the position" rows={5} />
          </div>
        ) : (
          <>
            <div className="mt-3 h-[16rem] w-full min-w-0 sm:h-[20rem]">
              <PayoffChart payoff={payoff} spot={spot} stale={stale} />
            </div>
            <div className="mt-5">
              <PayoffMetrics payoff={payoff} />
            </div>
          </>
        )}
      </section>

      <section className="mt-6 border-t border-border pt-5 pb-10">
        <h3 className="text-xs tracking-wide text-text-faint uppercase">Save</h3>
        <div className="mt-3">
          <SaveStrategyForm
            legs={legs}
            ticker={ticker}
            signedIn={session.data != null}
            existing={
              saved.data === undefined ? null : { id: saved.data.id, name: saved.data.name }
            }
            defaultKind={preset ?? "custom"}
          />
        </div>
      </section>
    </PageShell>
  );
};
