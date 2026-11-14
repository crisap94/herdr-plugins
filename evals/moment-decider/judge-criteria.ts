import type { JudgeCriterion } from '../lib/types.ts';

export const JUDGE_CRITERIA: readonly JudgeCriterion[] = [];

export const NO_JUDGE_REASON = 'Every criterion of this eval has a fixed form (six probabilities and a verdict from verdictOf), so code grades all of them and no judge call is made (SPEC.md section 3).';
