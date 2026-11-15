import type { EvalSpec, JudgeCriterion } from '../lib/types.ts';
import type { Expected, Input } from './prompt.ts';

export const JUDGE_CRITERIA: readonly JudgeCriterion[] = [];

export const JUDGE: EvalSpec<Input, Expected>['judge'] = null;
