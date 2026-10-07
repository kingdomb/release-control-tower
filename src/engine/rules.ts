import { completeness } from './completeness';
import { dependencyOrder } from './dependencyOrder';
import { envDoubleBooking } from './envDoubleBooking';
import { guardrail } from './guardrail';
import type { Rule } from './rule';
import { timeOverlap } from './timeOverlap';

/** Rules that depend on when a release is scheduled. A free slot must clear all of them. */
export const timedRules: Rule[] = [timeOverlap, envDoubleBooking, guardrail, dependencyOrder];

export const allRules: Rule[] = [...timedRules, completeness];
