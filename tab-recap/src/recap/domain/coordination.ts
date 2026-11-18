import { collapsedText } from './text-collapse.ts';
import type { Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';

const AWAITING = /^awaiting(?:-.+)?$/;
const NOTE = /^note(?:-(.+))?$/;

export function awaitingOf(tokens: ReadonlyMap<Text, Text>): string | null {
    const first = [...tokens.keys()].filter((name) => AWAITING.test(name) && (tokens.get(name) ?? '') !== '').toSorted()[0];
    return first === undefined ? null : (tokens.get(first) ?? null);
}

export interface NoteToken {
    readonly label: string;
    readonly value: string;
}

export const plainText = (raw: string): string => collapsedText(raw, 'space');

export function notesOf(tokens: Readonly<Record<string, string>>): readonly NoteToken[] {
    return Object.keys(tokens).toSorted().flatMap((name): NoteToken[] => {
        const found = NOTE.exec(name);
        const value = plainText(tokens[name] ?? '');
        return found === null || value === '' ? [] : [{ label: found[1] ?? 'note', value }];
    });
}

export function coordinationNamesOf(tokens: ReadonlyMap<Text, Text>): readonly string[] {
    return [...tokens.keys()].toSorted().filter((name) => {
        const raw = tokens.get(name) ?? '';
        return AWAITING.test(name) ? raw !== '' : NOTE.test(name) && plainText(raw) !== '';
    });
}
