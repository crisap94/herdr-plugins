import type { JudgeCriterion } from '../lib/types.ts';

const asked = (question: string): string => `the answer to this question is yes: "${question}"`;

export const JUDGE_CRITERIA: readonly JudgeCriterion[] = [
    {
        id: 'BJ1',
        rule: asked('Does the brief carry what every fact of must_keep says, each with the detail needed to act on it (names, paths and numbers kept)?'),
        breach: 'one fact of must_keep left out, or only gestured at without its names, paths or numbers. On a fail, the evidence quotes the first missing fact as the case writes it.',
    },
    {
        id: 'BJ2',
        rule: asked('For every decision in reasons that the brief holds, does the brief give the reason listed for it?'),
        breach: 'a decision of reasons stated in the brief without its reason, or with another reason. A decision the brief does not hold at all is not a breach of BJ2 (it is a breach of BJ1). When the brief holds no decision of reasons, BJ2 passes and the evidence quotes "reasons:" from the case.',
    },
    {
        id: 'BJ3',
        rule: asked('Does every decision, rule, path, number and open question in the brief come from the document?'),
        breach: 'a decision, rule, path, number or open question that the document inside <document> does not hold, or one changed in substance (another number, another path, the opposite choice).',
    },
    {
        id: 'BJ4',
        rule: asked('Does the brief leave every fact of settled closed: not asked for as open work, not asked again as a question?'),
        breach: 'a fact of settled presented as unfinished work or as a pending question. Naming it as settled or done is a pass. When settled says "none", BJ4 passes and the evidence quotes "settled: none" from the case.',
    },
    {
        id: 'BJ5',
        rule: asked('Reading only the brief as the operator\'s message, can the agent tell the goal, and every question of waiting_on_operator as waiting for the operator?'),
        breach: 'the goal absent or replaced by a closed one; a question of waiting_on_operator absent or told as answered; a reference to a thing the brief does not name.',
    },
];
