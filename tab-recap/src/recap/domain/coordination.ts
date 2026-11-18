import type { Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import { plainText } from './legacy.ts';

const AWAITING = /^awaiting(?:-.+)?$/;
export const NOTE = /^note(?:-(.+))?$/;

export function awaitingOf(tokens: ReadonlyMap<Text, Text>): Text | null {
    const first = [...tokens.keys()].filter((name) => AWAITING.test(name) && (tokens.get(name) ?? '') !== '').toSorted()[0];
    return first === undefined ? null : (tokens.get(first) ?? null);
}

export function coordinationNamesOf(tokens: ReadonlyMap<Text, Text>): readonly Text[] {
    return [...tokens.keys()].toSorted().filter((name) => {
        const raw = tokens.get(name) ?? '';
        return AWAITING.test(name) ? raw !== '' : NOTE.test(name) && plainText(raw) !== '';
    });
}

export type { NoteToken } from './legacy.ts';
export { notesOf, plainText } from './legacy.ts';
