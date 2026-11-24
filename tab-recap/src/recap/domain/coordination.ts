import { textOf, type Text } from '@stateforge-labs/session-ledger';
import { collapsedText } from './text-collapse.ts';

const AWAITING = /^awaiting(?:-.+)?$/;
export const NOTE = /^note(?:-(.+))?$/;

export function awaitingOf(tokens: ReadonlyMap<Text, Text>): Text | null {
    const first = [...tokens.keys()].filter((name) => AWAITING.test(name) && (tokens.get(name) ?? '') !== '').toSorted()[0];
    return first === undefined ? null : (tokens.get(first) ?? null);
}

export function coordinationNamesOf(tokens: ReadonlyMap<Text, Text>): readonly Text[] {
    return [...tokens.keys()].toSorted().filter((name) => {
        const raw = tokens.get(name) ?? textOf('');
        return AWAITING.test(name) ? raw !== '' : NOTE.test(name) && plainText(raw) !== '';
    });
}

export interface NoteToken {
    readonly label: Text;
    readonly value: Text;
}

export function notesOf(tokens: ReadonlyMap<Text, Text>): readonly NoteToken[] {
    return [...tokens.keys()].toSorted().flatMap((name): NoteToken[] => {
        const found = NOTE.exec(name);
        const value = plainText(tokens.get(name) ?? textOf(''));
        return found === null || value === '' ? [] : [{ label: textOf(found[1] ?? 'note'), value }];
    });
}

export function plainText(raw: Text): Text { return collapsedText(raw, 'space'); }
