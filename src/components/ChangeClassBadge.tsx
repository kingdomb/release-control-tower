import { useId, useState } from 'react';
import type { ChangeClass } from '../domain/types';
import { CHANGE_CLASS } from '../views/model';

const STYLE: Record<ChangeClass, string> = {
  standard: 'bg-go-tint text-go border-go/40',
  normal: 'bg-approach-tint text-approach border-approach/40',
  emergency: 'bg-alert-tint text-alert border-alert/40',
};

/** ITIL change-class badge. The meaning shows on hover and on keyboard focus. */
export function ChangeClassBadge({ value }: { value: ChangeClass }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const info = CHANGE_CLASS[value];
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className={`hit-44 inline-flex min-h-[28px] items-center rounded border px-2 text-xs font-semibold ${STYLE[value]}`}
        aria-describedby={id}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        {info.label}
        <span className="sr-only"> change</span>
      </button>
      <span
        role="tooltip"
        id={id}
        className={`absolute left-0 top-full z-50 mt-1 w-56 rounded border border-rule bg-ink px-3 py-2 text-xs font-normal leading-snug text-white shadow-lg ${
          open ? 'block' : 'sr-only'
        }`}
      >
        {info.label} change: {info.meaning}
      </span>
    </span>
  );
}
