import type { FC } from "react";

/**
 * the wordmark, which is the one drawn path in the app: it is a brand asset
 * rather than an icon, so it does not come from lucide. every other mark does.
 * kept here so the rail, the mobile drawer, and the auth screens share one copy
 * instead of three that can drift apart.
 */
export const Logo: FC<{ size?: number; className?: string }> = ({ size = 18, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 18 18"
    className={className}
    fill="none"
    stroke="var(--color-accent)"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 12.5 6 7.5l3.2 2.8L16 3.5" />
  </svg>
);
