import { Inbox, LoaderCircle, RotateCw, TriangleAlert } from "lucide-react";
import { type FC, type ReactNode, useEffect, useState } from "react";

/** the in-button pending glyph. a changed word alone is easy to miss on a fast
    response, so the motion is what actually reads as "working". */
export const Spinner: FC<{ className?: string }> = ({ className = "" }) => (
  <LoaderCircle
    size={14}
    strokeWidth={2}
    aria-hidden="true"
    className={`shrink-0 animate-spin ${className}`}
  />
);

interface LoadingStateProps {
  label: string;
  rows?: number;
  /** set to 0 for a load already known to be slow, so the skeleton is immediate */
  delayMs?: number;
}

/**
 * a load under about a tenth of a second reads as instant, so drawing a
 * skeleton for it only makes the page flash. measured on this app, the saved
 * strategies list resolved in 39ms and settings in 47ms - both were showing a
 * full skeleton and tearing it down again before anyone could register it,
 * which reads as jank rather than as loading.
 *
 * so nothing is drawn for the first beat. past it the request is genuinely slow
 * and the skeleton earns its place. the aria-live region only mounts with the
 * visible skeleton, which also stops a screen reader announcing a load that
 * already finished.
 */
export const LoadingState: FC<LoadingStateProps> = ({ label, rows = 6, delayMs = 150 }) => {
  const [show, setShow] = useState(delayMs === 0);

  useEffect(() => {
    if (delayMs === 0) return;
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  if (!show) return null;

  return (
    <div className="p-8" role="status" aria-live="polite">
      <p className="mb-6 text-sm text-text-faint">{label}</p>
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => `skeleton-${i}`).map((key, i) => (
          <div
            key={key}
            className="h-8 animate-pulse rounded-sm bg-surface-2"
            style={{ animationDelay: `${i * 60}ms`, opacity: 1 - i * 0.12 }}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * a centred spinner for a wait that has no shape to skeleton - a session check
 * rather than a list. held back on the same beat as LoadingState, so the common
 * case of an already-cached session renders nothing at all.
 */
export const PendingHold: FC<{ label: string; delayMs?: number }> = ({ label, delayMs = 150 }) => {
  const [show, setShow] = useState(delayMs === 0);

  useEffect(() => {
    if (delayMs === 0) return;
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  if (!show) return null;

  return (
    <div
      className="flex h-full items-center justify-center gap-2.5"
      role="status"
      aria-live="polite"
    >
      <Spinner className="text-text-faint" />
      <span className="text-sm text-text-faint">{label}</span>
    </div>
  );
};

interface EmptyStateProps {
  title: string;
  hint: string;
  action?: ReactNode;
}

export const EmptyState: FC<EmptyStateProps> = ({ title, hint, action }) => (
  <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
    {/* empty and error used to differ only by the colour of a hairline, which
        is not enough to tell "nothing here" from "something broke" */}
    <Inbox size={20} strokeWidth={1.5} aria-hidden="true" className="mb-3 text-text-faint" />
    <h3 className="text-md text-text">{title}</h3>
    <p className="mt-2 max-w-sm text-sm text-text-muted">{hint}</p>
    {action !== undefined && <div className="mt-6">{action}</div>}
  </div>
);

interface ErrorStateProps {
  title: string;
  message: string;
  onRetry?: () => void;
  /** for failures a retry cannot fix, where the action is a way out instead */
  retryLabel?: string;
}

/** deliberately not the empty state: a failure must never read as "no data" */
export const ErrorState: FC<ErrorStateProps> = ({
  title,
  message,
  onRetry,
  retryLabel = "Try again",
}) => (
  <div className="flex flex-col items-center justify-center px-6 py-20 text-center" role="alert">
    <TriangleAlert size={20} strokeWidth={1.5} aria-hidden="true" className="mb-3 text-neg" />
    <h3 className="text-md text-text">{title}</h3>
    <p className="mt-2 max-w-sm text-sm text-text-muted">{message}</p>
    {onRetry !== undefined && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 flex cursor-pointer items-center gap-2 rounded-sm border border-border-strong px-4 py-2 text-sm text-text transition-colors hover:border-accent-dim hover:text-accent active:translate-y-px"
      >
        <RotateCw size={14} strokeWidth={1.5} aria-hidden="true" />
        {retryLabel}
      </button>
    )}
  </div>
);
