import type { Conflict, Id } from '../domain/types';
import type { EvalContext } from './context';

/** A conflict before suggestions are attached. */
export interface RawConflict extends Omit<Conflict, 'suggestions'> {
  /** The release a reschedule suggestion should move, if any. */
  moveReleaseId?: Id;
}

export type Rule = (ctx: EvalContext) => RawConflict[];

export const conflictId = (rule: string, ...parts: Id[]) => `${rule}:${parts.join('|')}`;
