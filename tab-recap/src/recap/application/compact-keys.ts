import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { NOTE_LIMIT } from './compaction-message.ts';

export interface NoteState {
    readonly note: Text;
}

export interface SendEffect {
    readonly kind: 'send';
    readonly note: Text | null;
}

export interface CancelEffect {
    readonly kind: 'cancel';
}

export type NoteEffect = SendEffect | CancelEffect;

export interface NoteStepped {
    readonly state: NoteState;
    readonly effect: NoteEffect | null;
}

export const EMPTY_NOTE: NoteState = { note: must(parseText('')) };

const ESC = String.fromCodePoint(0x1b);
type Printability = 'printable' | 'control';

const printabilityOf = (key: string): Printability => {
    const printable = !key.startsWith(ESC) && Array.from(key).every((char) => (char.codePointAt(0) ?? 0) >= 0x20 && char !== '\u007f');
    return printable ? 'printable' : 'control';
};

export function noteOf(typed: string): Text | null {
    const note = typed.replace(/\s+/g, ' ').trim();
    if (note === '') {
        return null;
    }
    const parsed = parseText(note);
    return parsed.kind === 'ok' ? parsed.value : null;
}

export function step(state: NoteState, key: string): NoteStepped {
    if (key === '\r' || key === '\n') {
        return { state, effect: { kind: 'send', note: noteOf(state.note) } };
    }
    if (key === ESC || key === '\u0003') {
        return { state, effect: { kind: 'cancel' } };
    }
    if (key === '\u007f' || key === '\b') {
        return { state: { note: must(parseText(Array.from(state.note).slice(0, -1).join(''))) }, effect: null };
    }
    if (key === '\u0015') {
        return { state: EMPTY_NOTE, effect: null };
    }
    const text = key.replaceAll(/[\r\n]+/g, ' ');
    return { state: printabilityOf(text) === 'printable' ? { note: must(parseText(Array.from(state.note + text).slice(0, NOTE_LIMIT).join(''))) } : state, effect: null };
}
