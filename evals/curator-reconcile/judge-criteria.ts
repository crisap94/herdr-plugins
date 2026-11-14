import type { JudgeCriterion } from '../lib/types.ts';

export const JUDGE_CRITERIA: readonly JudgeCriterion[] = [
    {
        id: 'RJ1',
        rule: 'every operation is shown by its own quote. For a close: the quoted words, read in their turn, state that the fact is finished, wrong, replaced, or answered by the operator, as the operation\'s reason claims. For an update: the quoted words state what the new text says. A plan, a question, a partial result, or a statement about another thing does not show it. Pass only if this holds for every operation; quote the operation that fails otherwise. If the answer has no operation, pass and quote `No operation was kept.`',
        breach: 'An operation whose quote does not state what the operation claims.',
    },
];
