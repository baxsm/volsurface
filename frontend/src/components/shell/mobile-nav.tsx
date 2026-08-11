import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type FC, useEffect } from "react";
import { NavLink } from "react-router";
import { Glyph } from "./rail";

const LINKS = [
  { to: "/", label: "Surface", key: "surface" },
  { to: "/chain", label: "Chain", key: "chain" },
  { to: "/build", label: "Build", key: "build" },
  { to: "/strategies", label: "Strategies", key: "strategies" },
  { to: "/settings", label: "Settings", key: "settings" },
] as const;

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export const MobileNav: FC<MobileNavProps> = ({ open, onClose }) => {
  // the global reduced-motion css only zeroes transition and animation
  // durations. motion drives these springs from javascript, so they run at full
  // travel unless the component opts out itself.
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <motion.button
            type="button"
            aria-label="Close navigation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced === true ? 0 : 0.15 }}
            onClick={onClose}
            className="absolute inset-0 h-full w-full cursor-pointer bg-black/60"
          />
          <motion.nav
            aria-label="Main"
            initial={reduced === true ? false : { x: "-100%" }}
            animate={{ x: 0 }}
            exit={reduced === true ? { opacity: 0 } : { x: "-100%" }}
            transition={
              reduced === true ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 30 }
            }
            className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-surface"
          >
            <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
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
              <span className="text-sm font-medium tracking-tight">volsurface</span>
            </div>
            <ul className="flex flex-col gap-0.5 p-2">
              {LINKS.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.to === "/"}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm transition-colors active:translate-y-px ${
                        isActive
                          ? "bg-accent-glow text-accent"
                          : "text-text-muted hover:bg-surface-2 hover:text-text"
                      }`
                    }
                  >
                    <Glyph name={link.key} className="shrink-0" />
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </motion.nav>
        </div>
      )}
    </AnimatePresence>
  );
};
