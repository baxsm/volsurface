import { type FC, useState } from "react";
import { Link, useNavigate } from "react-router";
import { EmptyState, ErrorState, LoadingState, Spinner } from "@/components/ui/states";
import { ApiError } from "@/lib/api";
import { longDate } from "@/lib/format";
import { useDeleteStrategy, useStrategies } from "@/lib/queries";
import { PRESETS } from "@/lib/strategy";

const kindLabel = (kind: string): string =>
  PRESETS.find((preset) => preset.id === kind)?.label ?? kind;

export const StrategiesPage: FC = () => {
  const strategies = useStrategies(true);
  const remove = useDeleteStrategy();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState<string | null>(null);

  if (strategies.isPending) return <LoadingState label="Loading your strategies" rows={5} />;

  // a failure must never read as "you have none saved"
  if (strategies.isError) {
    return (
      <ErrorState
        title="Could not load your strategies"
        message={
          strategies.error instanceof ApiError
            ? strategies.error.message
            : "The server did not answer. Try again."
        }
        onRetry={() => void strategies.refetch()}
      />
    );
  }

  if (strategies.data.length === 0) {
    return (
      <EmptyState
        title="No saved strategies"
        hint="Build a position and save it, and it will be here to reopen."
        action={
          <Link
            to="/build"
            className="rounded-sm border border-border-strong px-4 py-2 text-sm text-text transition-colors hover:border-accent-dim hover:text-accent active:translate-y-px"
          >
            Open the builder
          </Link>
        }
      />
    );
  }

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        <h2 className="text-lg tracking-tight">Saved strategies</h2>
        <p className="mt-1 text-sm text-text-muted">
          Reopen a position in the builder, or remove it.
        </p>

        {remove.isError && (
          <p className="mt-4 text-sm text-neg" role="alert">
            {remove.error instanceof ApiError
              ? remove.error.message
              : "Could not delete that. Try again."}
          </p>
        )}

        <ul className="mt-6 border-t border-border">
          {strategies.data.map((strategy) => (
            <li
              key={strategy.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4"
            >
              <div className="min-w-0">
                <Link
                  to={`/build?strategy=${strategy.id}`}
                  className="text-sm text-text transition-colors hover:text-accent"
                >
                  {strategy.name}
                </Link>
                <p className="mt-1 text-xs text-text-faint">
                  {kindLabel(strategy.kind)}
                  {" - saved "}
                  <span className="num">{longDate(strategy.updatedAt.slice(0, 10))}</span>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void navigate(`/build?strategy=${strategy.id}`)}
                  className="cursor-pointer rounded-sm border border-border-strong px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-accent-dim hover:text-accent active:translate-y-px"
                >
                  Open
                </button>

                {confirming === strategy.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        remove.mutate(strategy.id, { onSettled: () => setConfirming(null) });
                      }}
                      disabled={remove.isPending}
                      className="flex cursor-pointer items-center gap-1.5 rounded-sm bg-neg px-3 py-1.5 text-xs text-bg transition-colors hover:bg-neg/90 active:bg-neg/75 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-neg"
                    >
                      {remove.isPending && <Spinner className="size-3" />}
                      {remove.isPending ? "Deleting" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="cursor-pointer rounded-sm border border-transparent px-2 py-1.5 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text active:translate-y-px"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(strategy.id)}
                    aria-label={`Delete ${strategy.name}`}
                    className="cursor-pointer rounded-sm border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-neg hover:text-neg active:translate-y-px"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
