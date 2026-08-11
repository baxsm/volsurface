import type { FC } from "react";
import { Link } from "react-router";
import { EmptyState } from "@/components/ui/states";

/** built on the shared empty state so a wrong url looks like the rest of the
    app rather than a bare sentence, and always offers a way back */
export const NotFound: FC<{ title: string; detail: string }> = ({ title, detail }) => (
  <EmptyState
    title={title}
    hint={detail}
    action={
      <Link
        to="/"
        className="rounded-sm border border-border-strong px-4 py-2 text-sm text-text transition-colors hover:border-accent-dim hover:text-accent active:translate-y-px"
      >
        Back to the surface
      </Link>
    }
  />
);
