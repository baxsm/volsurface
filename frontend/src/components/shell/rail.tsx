import { Box, ChevronRight, Settings2, SlidersHorizontal, Table2, Wallet } from "lucide-react";
import type { FC } from "react";
import { NavLink } from "react-router";
import { Logo } from "@/components/shell/logo";
import { useAppStore } from "@/lib/store";

/** the icon is paired with a visible text label everywhere, so it carries no
    meaning a screen reader needs and stays aria-hidden */
export const LINKS = [
  { to: "/", label: "Surface", Icon: Box },
  { to: "/chain", label: "Chain", Icon: Table2 },
  { to: "/build", label: "Build", Icon: SlidersHorizontal },
  { to: "/strategies", label: "Strategies", Icon: Wallet },
  { to: "/settings", label: "Settings", Icon: Settings2 },
] as const;

export const Rail: FC = () => {
  const collapsed = useAppStore((s) => s.railCollapsed);
  const toggleRail = useAppStore((s) => s.toggleRail);

  return (
    /* one inset drives the logo, the glyphs, and the chevron, so all three sit
       on the same column. it is a variable rather than swapped padding classes
       because the width animates: a class flip lands on frame one while the
       rail is still wide, which is what made the icons jump 76px before. as a
       length both states resolve to a real position and the glyph travels.
       collapsed centres a 16px glyph in the 56px rail, (56-16)/2 = 20px, less
       the 8px the list already pads. */
    <nav
      aria-label="Main"
      style={{ "--rail-inset": collapsed ? "12px" : "15px" } as React.CSSProperties}
      className={`hidden shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      {/* the logo sits at the same left inset as the glyphs below it, so the
          whole rail narrows around one fixed column rather than re-centring */}
      {/* the logo is 18px and sits outside the list's padding, so it centres at
          (56-18)/2 = 19px rather than the glyphs' inset */}
      <div
        style={{ "--logo-inset": collapsed ? "19px" : "13px" } as React.CSSProperties}
        className="flex h-14 items-center gap-2.5 overflow-hidden border-b border-border pl-(--logo-inset)"
      >
        <Logo className="shrink-0" />
        <span
          className={`truncate text-sm font-medium tracking-tight transition-opacity duration-150 ${
            collapsed ? "opacity-0" : "opacity-100"
          }`}
        >
          volsurface
        </span>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 p-2">
        {LINKS.map(({ to, label, Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === "/"}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex cursor-pointer items-center gap-3 overflow-hidden rounded-sm py-2 pl-(--rail-inset) text-sm transition-colors active:translate-y-px ${
                  isActive
                    ? "bg-accent-glow text-accent"
                    : "text-text-muted hover:bg-surface-2 hover:text-text"
                }`
              }
            >
              {/* the icon keeps one fixed left inset in both states, so the rail
                  narrowing never moves it. centring it on collapse instead made
                  it jump 76px right on the first frame and crawl back over the
                  whole 200ms, because justify-center applied while the rail was
                  still full width. */}
              <Icon size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
              {/* the label stays mounted and slides out under the clip. dropping
                  it from the tree on click made the text vanish a frame before
                  the rail had moved at all. */}
              <span
                aria-hidden={collapsed}
                className={`truncate transition-opacity duration-150 ${
                  collapsed ? "opacity-0" : "opacity-100"
                }`}
              >
                {label}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={toggleRail}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        style={{ "--chevron-inset": collapsed ? "20px" : "19px" } as React.CSSProperties}
        className="flex cursor-pointer items-center gap-3 overflow-hidden border-t border-border py-3 pl-(--chevron-inset) text-sm text-text-faint transition-colors hover:bg-surface-2 hover:text-text active:translate-y-px"
      >
        <ChevronRight
          size={16}
          strokeWidth={1.5}
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
        />
        <span
          className={`transition-opacity duration-150 ${collapsed ? "opacity-0" : "opacity-100"}`}
        >
          Collapse
        </span>
      </button>
    </nav>
  );
};
