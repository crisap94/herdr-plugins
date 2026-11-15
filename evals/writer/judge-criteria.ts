import type { JudgeCriterion } from '../lib/types.ts';

export const JUDGE_CRITERIA: readonly JudgeCriterion[] = [
    {
        id: 'WJ1',
        rule: 'every key fact listed under "Key facts" is stated by one kept item of the answer, and a key fact with a reason is matched only by an item that also gives that reason. Question: "For each key fact listed: does one kept item state it? A decision counts only if the item also gives its reason. Quote the item for each key fact. Pass only if every key fact is carried." When the case reads "Key facts: none", give pass and quote that line.',
        breach: 'one or more key facts with no kept item to quote, or a decision whose item gives no reason.',
    },
    {
        id: 'WJ2',
        rule: 'every kept add or update is stated by the transcript shown and nothing later in the transcript contradicts it. Question: "For each kept add or update: does the transcript shown state what the item says, and does nothing later in the transcript contradict it? Quote the transcript for each item. An item that states one of the claims the input does not support fails." When the answer keeps no add or update, give pass and quote the answer line.',
        breach: 'one or more kept items with no transcript quote that states them, an item that a later turn contradicts, or an item that states one of the claims the input does not support.',
    },
    {
        id: 'WJ3',
        rule: 'no kept add rewords another kept item or one of the open ledger facts shown. Question: "Is any kept add a rewording of another kept item, or of an open ledger fact shown? Name the pair, or answer none. Pass only on none." For a pass, quote the kept add you checked last; when the answer keeps no add, quote the answer line.',
        breach: 'a named pair: a kept add that says the same thing as another kept item or as an open ledger fact shown, in other words.',
    },
    {
        id: 'WJ4',
        rule: 'every kept item is understood without the transcript and its subject is the work, never the agent or the tool. Question: "Is every kept item understood without the transcript (no unresolved it, this, that, the issue) and is its subject the work, never the agent or the tool? Quote any item that fails." For a pass, quote one kept item; when the answer keeps no add or update, quote the answer line.',
        breach: 'a quoted kept item that leans on the transcript (an unresolved it, this, that or the issue) or whose subject is the agent or the tool (I, we, the agent, Claude, Codex) instead of the work.',
    },
];

export const JUDGE_IDS: readonly string[] = JUDGE_CRITERIA.map((criterion) => criterion.id);
