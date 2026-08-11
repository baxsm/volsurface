import type { FC, ReactNode } from "react";

/**
 * the one content column for the scrolling pages.
 *
 * build, strategies and settings each used to hand-roll their own wrapper, and
 * had drifted to three different widths (1152, 768, 672) and three different
 * padding scales, so moving between them shifted the column under the reader.
 * chain and surface are deliberately not in here: they are full-bleed data
 * canvases, not reading columns.
 */
export const PageShell: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="scrollbar-thin h-full overflow-x-hidden overflow-y-auto">
    <div className="mx-auto min-w-0 max-w-6xl px-4 py-6 md:px-8">{children}</div>
  </div>
);
