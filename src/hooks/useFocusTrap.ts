import { useEffect, type RefObject } from 'react';

// Stack of open layers so Escape only closes the topmost one, wherever focus is.
const stack: { close: () => void }[] = [];
let listening = false;
const onDocKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && stack.length) { e.stopPropagation(); stack[stack.length - 1].close(); }
};

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Traps Tab inside `ref`, closes on Escape, locks body scroll and restores focus on unmount. */
export function useFocusTrap(ref: RefObject<HTMLElement>, onClose: () => void, initialFocus = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previous = document.activeElement as HTMLElement | null;
    const scrollY = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (initialFocus) {
      const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? el).focus();
    }
    const entry = { close: onClose };
    stack.push(entry);
    if (!listening) { document.addEventListener('keydown', onDocKey); listening = true; }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(entry), 1);
      if (!stack.length) { document.removeEventListener('keydown', onDocKey); listening = false; }
      document.body.style.overflow = scrollY;
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
