import { AnimatePresence, motion } from "motion/react";
import { type FC, useEffect } from "react";
import { NavLink } from "react-router";

const LINKS = [
  { to: "/", label: "Surface" },
  { to: "/chain", label: "Chain" },
  { to: "/build", label: "Build" },
  { to: "/strategies", label: "Strategies" },
  { to: "/settings", label: "Settings" },
] as const;

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export const MobileNav: FC<MobileNavProps> = ({ open, onClose }) => {
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
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60"
          />
          <motion.nav
            aria-label="Main"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
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
                      `block rounded-sm px-3 py-2.5 text-sm transition-colors ${
                        isActive
                          ? "bg-accent-glow text-accent"
                          : "text-text-muted hover:bg-surface-2 hover:text-text"
                      }`
                    }
                  >
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
