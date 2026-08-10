import type { FC } from "react";

/**
 * routes that exist in the shell but whose views land in a later phase. this
 * states plainly that the view is not built rather than rendering a fake
 * dashboard that would read as finished work.
 */
export const NotBuiltYet: FC<{ title: string; detail: string }> = ({ title, detail }) => (
  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
    <h2 className="text-md text-text">{title}</h2>
    <p className="mt-2 max-w-sm text-sm text-text-muted">{detail}</p>
  </div>
);
