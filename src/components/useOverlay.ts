import { useEffect, useRef, type RefObject } from 'react';

/**
 * Shared overlay behaviour: close on Escape and on a pointer-down outside `panelRef`,
 * move focus into the panel when it opens, and return focus to the opener when it closes.
 */
export function useOverlay(open: boolean, onClose: () => void, panelRef: RefObject<HTMLElement | null>) {
  const opener = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('button, [href], input, select, textarea');
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (panel && !panel.contains(e.target as Node)) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    // The pointerdown that opened the overlay fired before this effect, so it cannot close it.
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      const target = opener.current;
      if (target && document.contains(target)) {
        target.focus();
        // An outside click moves focus to the clicked spot after this runs. If that spot is not
        // focusable (focus fell to <body>), put focus back on the opener; never steal it from a control.
        window.setTimeout(() => {
          const active = document.activeElement;
          if ((!active || active === document.body) && document.contains(target)) target.focus();
        }, 0);
      }
    };
  }, [open, panelRef]);
}
