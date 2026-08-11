import { type RefObject, useEffect } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const focusableIn = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    // a hidden or collapsed control is in the dom but cannot be focused, and
    // including it would put dead stops in the cycle
    if (el.hasAttribute("inert")) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  });

/**
 * keeps keyboard focus inside an open overlay, and gives it back when it closes.
 *
 * both the mobile drawer and the contract panel cover the page while the content
 * underneath stays in the tab order, so tabbing walked straight out of the
 * dialog into content the user could not see. escape was already handled; this
 * is the rest of the dialog contract.
 *
 * `active` is a parameter rather than assumed from the ref because the contract
 * panel is only modal on a phone. on a desktop it is a side panel next to a
 * table the user is meant to keep clicking, and trapping focus there would be
 * wrong.
 */
export const useFocusTrap = (ref: RefObject<HTMLElement | null>, active: boolean): void => {
  useEffect(() => {
    const root = ref.current;
    if (!active || root === null) return;

    // whatever opened the overlay, so focus can be handed back to it rather
    // than falling to the top of the document on close
    const opener = document.activeElement as HTMLElement | null;

    const first = focusableIn(root)[0];
    // the container itself takes focus when it holds no controls, so the
    // starting point is always inside. -1 keeps it out of the tab cycle, and
    // the global css already suppresses a focus ring on that case.
    if (first === undefined) {
      root.setAttribute("tabindex", "-1");
      root.focus();
    } else {
      first.focus();
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const focusable = focusableIn(root);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (firstEl === undefined || lastEl === undefined) return;

      const current = document.activeElement;
      // wrap at both ends, and pull focus back in if it has already escaped
      if (!root.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? lastEl : firstEl).focus();
        return;
      }
      if (event.shiftKey && current === firstEl) {
        event.preventDefault();
        lastEl.focus();
        return;
      }
      if (!event.shiftKey && current === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // only if focus is still inside: the user may have clicked elsewhere on
      // the way out, and yanking it back would be worse than leaving it
      if (root.contains(document.activeElement) && opener?.isConnected === true) {
        opener.focus();
      }
    };
  }, [ref, active]);
};
