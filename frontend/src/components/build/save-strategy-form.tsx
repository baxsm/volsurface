import { Check } from "lucide-react";
import { type FC, type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { Spinner } from "@/components/ui/states";
import { ApiError } from "@/lib/api";
import { useSaveStrategy } from "@/lib/queries";
import { legsAreComplete, type StrategyLeg } from "@/lib/strategy";

const MAX_NAME = 120;

interface SaveStrategyFormProps {
  legs: StrategyLeg[];
  ticker: string | null;
  signedIn: boolean;
  /** set when the builder opened a saved strategy, which turns save into re-save */
  existing: { id: string; name: string } | null;
  defaultKind: string;
}

export const SaveStrategyForm: FC<SaveStrategyFormProps> = ({
  legs,
  ticker,
  signedIn,
  existing,
  defaultKind,
}) => {
  const [name, setName] = useState(existing?.name ?? "");
  const [saved, setSaved] = useState(false);
  const save = useSaveStrategy();

  // opening a different saved strategy has to refill the field, but typing must
  // not be overwritten, so this keys on which strategy is open rather than
  // running on every render. the id is the trigger even though only the name is
  // read: two strategies can share a name, and switching between them still has
  // to reset the field.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the id is the intended trigger
  useEffect(() => {
    setName(existing?.name ?? "");
    setSaved(false);
  }, [existing?.id, existing?.name]);

  const complete = legsAreComplete(legs);
  const trimmed = name.trim();
  const canSave = signedIn && complete && trimmed.length > 0 && !save.isPending;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;

    save.mutate(
      {
        ...(existing === null ? {} : { id: existing.id }),
        name: trimmed,
        kind: defaultKind,
        ...(ticker === null ? {} : { ticker }),
        legs,
      },
      { onSuccess: () => setSaved(true) },
    );
  };

  if (!signedIn) {
    return (
      <p className="text-sm text-text-muted">
        <Link to="/sign-in" className="text-accent hover:underline">
          Sign in
        </Link>{" "}
        to save this position and open it again later.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor="strategy-name">
          Strategy name
        </label>
        <input
          id="strategy-name"
          value={name}
          maxLength={MAX_NAME}
          placeholder="Name this position"
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
          className="w-full rounded-sm border border-border bg-surface-2 px-3 py-2 text-sm text-text transition-colors placeholder:text-text-faint hover:border-border-strong focus:border-accent-dim"
        />
      </div>

      <button
        type="submit"
        disabled={!canSave}
        aria-busy={save.isPending}
        className="flex cursor-pointer items-center gap-2 rounded-sm bg-accent px-4 py-2 text-sm text-bg transition-colors hover:bg-accent/90 active:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
      >
        {save.isPending ? <Spinner /> : <Check size={14} strokeWidth={2} aria-hidden="true" />}
        {save.isPending ? "Saving" : existing === null ? "Save" : "Save changes"}
      </button>

      <p className="w-full text-xs" aria-live="polite">
        {save.isError ? (
          <span className="text-neg">
            {save.error instanceof ApiError ? save.error.message : "Could not save. Try again."}
          </span>
        ) : saved ? (
          <span className="text-pos">
            Saved.{" "}
            <Link
              to="/strategies"
              className="cursor-pointer underline transition-colors hover:text-accent"
            >
              See your strategies
            </Link>
          </span>
        ) : !complete ? (
          <span className="text-text-faint">Finish every leg to save this position.</span>
        ) : name.trim() === "" ? (
          // otherwise the button just sits dead with nothing saying why
          <span className="text-text-faint">Give this position a name to save it.</span>
        ) : null}
      </p>
    </form>
  );
};
