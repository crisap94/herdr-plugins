import type { JudgeCriterion, JudgeView } from '../lib/types.ts';
import { judgeDocument } from './prompt.ts';
import type { StoryItem } from './prompt.ts';
import { readAnswer } from './scoring.ts';

export const NO_WAIT = 'No open fact in section needs: SJ3 does not apply to this case.';

export const JUDGE_CRITERIA: readonly JudgeCriterion[] = [
    {
        id: 'SJ1',
        rule: 'the paragraph in <answer>, read against the <ledger> in <case>, gives an empty list to this question: "List every statement in the paragraph that no fact in the ledger supports (an event, a decision, a reason, a name, a number, a status). Pass only if the list is empty." Use no note for SJ1: judge it against the whole ledger.',
        breach: 'one statement of the paragraph that no fact in the ledger supports. Saying less than the ledger is not a breach.',
    },
    {
        id: 'SJ2',
        rule: 'the answer to this question about the paragraph in <answer> and the <ledger> in <case> is that it does not: "Does the paragraph present as true now, as the plan, or as still pending, anything that the ledger holds only in a fact closed as wrong, superseded or answered? Pass only if it does not. Telling it as past (first X, then replaced by Y) is a pass." <notes_sj2> lists the closed facts planted in this case and what the paragraph must not say; the question holds for every closed fact of the ledger, listed or not.',
        breach: 'one statement that presents as true now, as the plan or as still pending something the ledger holds only in a fact closed as wrong, superseded or answered.',
    },
    {
        id: 'SJ3',
        rule: `the answer to this question about the paragraph in <answer> is yes: "An open fact in section needs waits on the operator. Does the paragraph say what the operator has to do or decide? Pass only if it does." <notes_sj3> names the open needs facts and what the paragraph has to say. When <notes_sj3> reads "${NO_WAIT}", give pass and quote that sentence.`,
        breach: 'the paragraph does not mention what waits on the operator, or says that something waits without saying what the operator has to do or decide.',
    },
];

function notesSj2(item: StoryItem): string {
    const closed = item.expected.closed_ids;
    const lines = closed.length === 0
        ? ['No closed fact is planted in this case; SJ2 still holds for every closed fact of the ledger.']
        : closed.map((entry) => `- ${entry.id} (closed as ${entry.closed_why}; replaced by ${entry.current ?? 'no open fact'}): the paragraph must not say ${entry.must_not_say}.`);
    return ['<notes_sj2>', 'Only for SJ2. Reference notes written by a model and not audited.', ...lines, '</notes_sj2>'].join('\n');
}

function notesSj3(item: StoryItem): string {
    const waiting = item.expected.waiting_on_operator;
    const lines = waiting === null ? [NO_WAIT] : [`Open needs facts: ${waiting.ids.join(', ')}.`, `What the paragraph has to say: ${waiting.gist}.`];
    return ['<notes_sj3>', 'Only for SJ3. Reference notes written by a model and not audited.', ...lines, '</notes_sj3>'].join('\n');
}

export function judgeView(item: StoryItem, text: string): JudgeView {
    return {
        case: [judgeDocument(item), notesSj2(item), notesSj3(item)].join('\n'),
        answer: readAnswer(item, text)?.story ?? '',
    };
}
