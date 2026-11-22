import {
    type RecapRequest,
    type Stories,
    type StoryChange,
    type KeptStory,
    type Unknown,
    type Writer,
    type Written,
} from '@stateforge-labs/session-ledger';
import type { MemoryStore } from './memory-store.ts';
import type { Behaviour, Run } from './behaviour.ts';
import { text, usd } from './values.ts';

export type WrittenAnswer = { readonly kind: 'written'; readonly text: string; readonly costUsd: number };

const writtenOf = (answered: WrittenAnswer | Unknown): Written =>
    answered.kind === 'written' ? { kind: 'written', text: text(answered.text), costUsd: usd(answered.costUsd) } : answered;

export const storiesOf = (changes: StoryChange[]): Stories => {
    const kept = new Map<string, KeptStory>();
    return {
        read: (task) => kept.get(`${task.tab}\u0000${task.key}`) ?? null,
        keep: (run, change) => {
            changes.push(change);
            if (change.story !== null) {
                kept.set(`${run.task.tab}\u0000${run.task.key}`, { text: change.story, at: run.at });
            }
            return { changed: [], refused: [] };
        },
    };
};

export const writerOf = (run: Run, store: MemoryStore, requests: RecapRequest[], behaviour: () => Behaviour<WrittenAnswer> | undefined): Writer => ({
    backend: 'scripted',
    contract: 'free-text',
    write: (request: RecapRequest) => {
        requests.push(request);
        const scripted = behaviour();
        if (scripted !== undefined) {
            return run(scripted).then(writtenOf);
        }
        return run<WrittenAnswer>({ kind: 'answer', value: { kind: 'written', text: store.markdown(), costUsd: 0 } }).then(writtenOf);
    },
});
