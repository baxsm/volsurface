import { AnimatePresence, motion } from "motion/react";
import type { FC } from "react";
import { NavLink } from "react-router";
import { useAppStore } from "@/lib/store";

const LINKS = [
  { to: "/", label: "Surface", key: "surface" },
  { to: "/chain", label: "Chain", key: "chain" },
  { to: "/build", label: "Build", key: "build" },
  { to: "/strategies", label: "Strategies", key: "strategies" },
  { to: "/settings", label: "Settings", key: "settings" },
] as const;

// paired with a visible text label in every use, so the glyph itself carries no
// meaning a screen reader needs
const GLYPHS: Record<string, React.ReactNode> = {
  surface: (
    <>
      <path d="M1.5 10.5 5 6l3 2.5L11 3.5l3.5 3" />
      <path d="M1.5 13.5 5 9l3 2.5L11 6.5l3.5 3" opacity="0.45" />
    </>
  ),
  chain: (
    <>
      <path d="M2 3.5h12M2 8h12M2 12.5h12" />
      <path d="M6.5 2v12" opacity="0.45" />
    </>
  ),
  build: (
    <>
      <path d="M1.5 11.5 6 7l3 3 5.5-6.5" />
      <path d="M1.5 14h13" opacity="0.45" />
    </>
  ),
  strategies: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M5 6.5h6M5 9.5h4" opacity="0.6" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2.25" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" />
    </>
  ),
};

/** shared with the mobile drawer, so both navs to the same five routes carry
    the same icons rather than one being text-only */
export const Glyph: FC<{ name: string; className?: string }> = ({ name, className }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {GLYPHS[name] ?? GLYPHS.settings}
  </svg>
);

export const Rail: FC = () => {
  const collapsed = useAppStore((s) => s.railCollapsed);
  const toggleRail = useAppStore((s) => s.toggleRail);

  return (
    <nav
      aria-label="Main"
      className={`hidden shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
          <title>volsurface</title>
          <path
            d="M2 12.5 6 7.5l3.2 2.8L16 3.5"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="truncate text-sm font-medium tracking-tight"
            >
              volsurface
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 p-2">
        {LINKS.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              end={link.to === "/"}
              title={collapsed ? link.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors active:translate-y-px ${
                  isActive
                    ? "bg-accent-glow text-accent"
                    : "text-text-muted hover:bg-surface-2 hover:text-text"
                } ${collapsed ? "justify-center px-0" : ""}`
              }
            >
              <Glyph name={link.key} className="shrink-0" />
              {!collapsed && <span className="truncate">{link.label}</span>}
            </NavLink>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={toggleRail}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="flex cursor-pointer items-center gap-3 border-t border-border px-4 py-3 text-sm text-text-faint transition-colors hover:bg-surface-2 hover:text-text active:translate-y-px"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        {!collapsed && <span>Collapse</span>}
      </button>
    </nav>
  );
};
