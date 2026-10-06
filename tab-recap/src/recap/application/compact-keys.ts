// The compaction popup as a pure reducer: a one-line note the operator may type. Enter sends (the note, or none), Esc cancels.
import { NOTE_LIMIT } from './compaction-message.ts';

export interface NoteState {
    readonly note: string;
}

export type NoteEffect = { readonly kind: 'send'; readonly note: string | null } | { readonly kind: 'cancel' };

export interface NoteStepped {
    readonly state: NoteState;
    readonly effect: NoteEffect | null;
}

export const EMPTY_NOTE: NoteState = { note: '' };

const ESC = String.fromCodePoint(0x1b);
const isPrintable = (key: string): boolean => !key.startsWith(ESC) && Array.from(key).every((char) => (char.codePointAt(0) ?? 0) >= 0x20 && char !== '\u007f');

/** What is sent for a typed note: trimmed, on one line; nothing typed is no note at all. */
export function noteOf(typed: string): string | null {
    const note = typed.replace(/\s+/g, ' ').trim();
    return note === '' ? null : note;
}

/** One key. Pasted text arrives as one key and is kept up to the limit; Ctrl-U clears, Backspace erases one character. */
export function step(state: NoteState, key: string): NoteStepped {
    if (key === '\r' || key === '\n') {
        return { state, effect: { kind: 'send', note: noteOf(state.note) } };
    }
    if (key === ESC || key === '\u0003') {
        return { state, effect: { kind: 'cancel' } };
    }
    if (key === '\u007f' || key === '\b') {
        return { state: { note: Array.from(state.note).slice(0, -1).join('') }, effect: null };
    }
    if (key === '\u0015') {
        return { state: EMPTY_NOTE, effect: null };
    }
    const text = key.replaceAll(/[\r\n]+/g, ' ');
    return { state: isPrintable(text) ? { note: Array.from(state.note + text).slice(0, NOTE_LIMIT).join('') } : state, effect: null };
}
