import type { Conflict, Release } from '../domain/types';
import { CHANGE_CLASS, RULE_LABEL } from './model';

interface Props {
  release: Release;
  conflicts: Conflict[];
  focused?: boolean;
  draft?: boolean;
  timeLabel?: string;
}

/** A release drawn as a flight-progress strip: change-class bar, title, conflict count. */
export function Strip({ release, conflicts, focused, draft, timeLabel }: Props) {
  return (
    <div
      className="strip h-full"
      data-class={release.changeClass}
      data-conflict={conflicts.length > 0}
      data-focus={focused || undefined}
      data-draft={draft || undefined}
    >
      <span className="strip-bar" aria-hidden="true" />
      <span className="strip-body">
        {timeLabel && <span className="shrink-0 tabular-nums text-ink-soft">{timeLabel}</span>}
        <span className="strip-title">{release.title}</span>
        {conflicts.length > 0 && (
          <span
            className="ml-auto inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-alert px-1 text-[0.7rem] font-semibold text-white"
            aria-hidden="true"
          >
            {conflicts.length}
          </span>
        )}
      </span>
    </div>
  );
}

/** Accessible name and native tooltip for a strip. */
export function stripDescription(release: Release, conflicts: Conflict[], when: string): string {
  const head = `${release.title}, ${CHANGE_CLASS[release.changeClass].label} change, ${when}`;
  if (!conflicts.length) return `${head}. No conflicts.`;
  return `${head}. ${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''}: ${conflicts
    .map((c) => `${RULE_LABEL[c.rule]}: ${c.message}`)
    .join(' ')}`;
}
