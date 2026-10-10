const AWAITING = /^awaiting(?:-.+)?$/;
const NOTE = /^note(?:-(.+))?$/;

export function awaitingOf(tokens: Readonly<Record<string, string>>): string | null {
    const first = Object.keys(tokens).filter((name) => AWAITING.test(name) && (tokens[name] ?? '') !== '').toSorted()[0];
    return first === undefined ? null : (tokens[first] ?? null);
}

export interface NoteToken {
    readonly label: string;
    readonly value: string;
}

export const plainText = (raw: string): string => raw.replace(/\p{Cc}/gu, ' ').replace(/ {2,}/g, ' ').trim();

export function notesOf(tokens: Readonly<Record<string, string>>): readonly NoteToken[] {
    return Object.keys(tokens).toSorted().flatMap((name): NoteToken[] => {
        const found = NOTE.exec(name);
        const value = plainText(tokens[name] ?? '');
        return found === null || value === '' ? [] : [{ label: found[1] ?? 'note', value }];
    });
}
