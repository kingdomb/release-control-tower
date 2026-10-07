import { useRef, useState } from 'react';
import { useOverlay } from './useOverlay';

export interface HeaderAction {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

interface Props {
  /** One list, rendered inline at lg+ and inside the menu below lg. */
  actions: HeaderAction[];
  timeZone: string;
}

export function Header({ actions, timeZone }: Props) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useOverlay(open, () => setOpen(false), panel);

  return (
    <header className="no-print border-b border-rule bg-white">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-2">
        <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden="true">
          <rect width="32" height="32" rx="6" fill="#18222F" />
          <rect x="6" y="8" width="20" height="5" rx="1" fill="#F6F8FB" />
          <rect x="6" y="8" width="3" height="5" fill="#1D5BB8" />
          <rect x="6" y="15" width="20" height="5" rx="1" fill="#F6F8FB" />
          <rect x="6" y="15" width="3" height="5" fill="#B4122B" />
          <rect x="6" y="22" width="14" height="3" rx="1" fill="#B9770E" />
        </svg>
        <div className="min-w-0 flex-1">
          <h1 className="font-cond text-xl font-semibold leading-tight sm:text-2xl">Release Control Tower</h1>
          <p className="truncate text-xs text-ink-soft">Times shown in {timeZone.replace(/_/g, ' ')}</p>
        </div>

        <nav aria-label="Data actions" className="hidden items-center gap-2 lg:flex">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`btn ${a.tone === 'danger' ? 'btn-danger' : ''}`}
              onClick={a.onClick}
              disabled={a.disabled}
            >
              {a.label}
            </button>
          ))}
        </nav>

        <div className="relative lg:hidden" ref={panel}>
          <button
            type="button"
            className="btn shrink-0"
            aria-expanded={open}
            aria-controls="data-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
          {open && (
            <div id="data-menu" className="absolute right-0 top-full z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded border border-rule bg-white p-2 shadow-lg">
              <ul className="flex flex-col gap-1">
                {actions.map((a, i) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      data-autofocus={i === 0 || undefined}
                      className={`btn w-full justify-start ${a.tone === 'danger' ? 'btn-danger' : ''}`}
                      disabled={a.disabled}
                      onClick={() => {
                        setOpen(false);
                        a.onClick();
                      }}
                    >
                      {a.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
