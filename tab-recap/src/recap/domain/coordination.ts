// What other tools put on a lane's pane, read from its tokens: `awaiting` / `awaiting-<tool>` (a wait in flight) and `note` / `note-<tool>`
// (a line shown under the lane's header, labelled with the tool). Pure: a token name is read by its prefix, never written.

const AWAITING = /^awaiting(?:-.+)?$/;
const NOTE = /^note(?:-(.+))?$/;

/** The value of the first non-empty `awaiting` token (by name), or null when the pane is not waiting. */
export function awaitingOf(tokens: Readonly<Record<string, string>>): string | null {
    const first = Object.keys(tokens).filter((name) => AWAITING.test(name) && (tokens[name] ?? '') !== '').toSorted()[0];
    return first === undefined ? null : (tokens[first] ?? null);
}

export interface NoteToken {
    /** the tool's name taken from the token name, or `note` for a bare `note` */
    readonly label: string;
    readonly value: string;
}

/** Every non-empty `note` / `note-<tool>` token, in name order. */
export function notesOf(tokens: Readonly<Record<string, string>>): readonly NoteToken[] {
    return Object.keys(tokens).toSorted().flatMap((name): NoteToken[] => {
        const found = NOTE.exec(name);
        const value = tokens[name] ?? '';
        return found === null || value === '' ? [] : [{ label: found[1] ?? 'note', value }];
    });
}
