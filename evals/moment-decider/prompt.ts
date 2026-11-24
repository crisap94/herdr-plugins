import { readFileSync } from 'node:fs';
import { autocompactState, type DeciderState } from '../../packages/session-ledger/src/recap/application/autocompact-state.ts';
import { QUESTIONS } from '../../packages/session-ledger/src/recap/application/autocompact-questions.ts';
import { deciderInstructions } from '../../tab-recap/src/adapters/job/decider.ts';
import type { Entry } from '../../packages/session-ledger/src/ports/transcripts.ts';
import type { HistoryFact } from '../../packages/session-ledger/src/ports/ledger.ts';
import type { Item, Prompt } from '../lib/types.ts';

export type Side = 'true' | 'false' | 'open';

export interface Evidence {
    readonly question: string;
    readonly field: keyof DeciderState;
    readonly quote: string;
}

export interface Input {
    readonly recent: readonly Entry[];
    readonly history: readonly HistoryFact[];
}

export interface Expected {
    readonly answers: Readonly<Record<string, Side>>;
    readonly verdict: 'compact' | 'wait';
    readonly evidence: readonly Evidence[];
    readonly note: string;
}

export type DeciderItem = Item<Input, Expected>;

export const QUESTION_IDS: readonly string[] = Object.keys(QUESTIONS);

export const SYSTEM: string = deciderInstructions(QUESTIONS);

export const stateOf = (item: DeciderItem): DeciderState => autocompactState(item.input.recent, item.input.history);

export function prompt(item: DeciderItem): Prompt {
    return { system: SYSTEM, user: JSON.stringify(stateOf(item)) };
}

export function loadItems(file: string): DeciderItem[] {
    return readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as DeciderItem);
}
