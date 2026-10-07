import { useId, useRef, type ReactNode } from 'react';
import { useOverlay } from './useOverlay';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** Accessible dialog: Escape and outside click close it; focus moves in and returns to the opener. */
export function Modal({ title, onClose, children, footer, wide }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useOverlay(true, onClose, panel);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-lg bg-white shadow-2xl sm:rounded-lg ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-start gap-2 border-b border-rule p-4">
          <h2 id={id} className="min-w-0 flex-1 font-cond text-xl font-semibold">
            {title}
          </h2>
          <button type="button" className="btn shrink-0" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-rule p-4">{footer}</div>}
      </div>
    </div>
  );
}
