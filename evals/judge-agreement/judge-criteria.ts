import type { JudgeCriterion } from '../lib/types.ts';

export const JUDGE_CRITERIA: readonly JudgeCriterion[] = [];

export const NO_JUDGE_REASON = 'Part A of this eval has no judge criterion: every criterion (J1 to J4) compares the parsed verdicts of the plugin judge with the planted labels, so code grades all of them and no judge call is made (SPEC.md section 3). Part B, the check of the suite judge on its own criteria, is specified in SPEC.md section 7 and not built.';
