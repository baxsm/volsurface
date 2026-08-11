import type { FC, ReactNode } from "react";

/** the in-button pending glyph. a changed word alone is easy to miss on a fast
    response, so the motion is what actually reads as "working". */
export const Spinner: FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    className={`animate-spin ${className}`}
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
    <path
      d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

interface LoadingStateProps {
  label: string;
  rows?: number;
}

export const LoadingState: FC<LoadingStateProps> = ({ label, rows = 6 }) => (
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

interface EmptyStateProps {
  title: string;
  hint: string;
  action?: ReactNode;
}

export const EmptyState: FC<EmptyStateProps> = ({ title, hint, action }) => (
  <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
    <div className="mb-4 h-px w-12 bg-border-strong" />
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
    <div className="mb-4 h-px w-12 bg-neg" />
    <h3 className="text-md text-text">{title}</h3>
    <p className="mt-2 max-w-sm text-sm text-text-muted">{message}</p>
    {onRetry !== undefined && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 cursor-pointer rounded-sm border border-border-strong px-4 py-2 text-sm text-text transition-colors hover:border-accent-dim hover:text-accent active:translate-y-px"
      >
        {retryLabel}
      </button>
    )}
  </div>
);
