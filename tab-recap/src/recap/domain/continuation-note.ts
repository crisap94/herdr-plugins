import { err, must, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from './brand.ts';
import { plainText } from './coordination.ts';
import type { AwaitedNames, Awaiting, BackgroundItem, BackgroundLabel, BackgroundTool } from './in-flight.ts';
import type { ParseFailure } from './parse-failure.ts';
import { parseText, type Text } from './text.ts';

export type ContinuationNote = Brand<string, 'ContinuationNote'>;
export type NoteLimit = Brand<number, 'NoteLimit'>;

type NoteFragment = AwaitedNames | BackgroundTool | BackgroundLabel;
type Mention = 'mentioned' | 'unmentioned';
type NoteFit = 'kept' | 'dropped';

export function parseNoteLimit(input: unknown): Result<NoteLimit, ParseFailure> {
    if (typeof input !== 'number') {
        return err({ kind: 'not-a-number' });
    }
    if (!Number.isInteger(input)) {
        return err({ kind: 'not-an-integer' });
    }
    return ok(brand<number, 'NoteLimit'>(input));
}

export function parseContinuationNote(input: unknown): Result<ContinuationNote, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    return ok(brand<string, 'ContinuationNote'>(input));
}

export const NOTE_LIMIT = must(parseNoteLimit(400));

const ELLIPSIS = '…';

const plain = (raw: NoteFragment): Text => must(parseText(plainText(raw.replaceAll(/\p{Cf}/gu, ' ').replaceAll('"', "'").replaceAll(/\s+/g, ' '))));

const itemText = (item: BackgroundItem): Text => must(parseText(`${plain(item.tool)} "${plain(item.label)}"`));

function waitingPart(awaiting: Awaiting): Text[] {
    return awaiting.kind === 'on' ? [must(parseText(`Still waiting for: ${plain(awaiting.names)}.`))] : [];
}

function runningPart(background: readonly BackgroundItem[]): Text[] {
    return background.length === 0 ? [] : [must(parseText(`Still running: ${background.map(itemText).join(', ')}.`))];
}

export function cutNote(text: Text, limit: NoteLimit): Text {
    const chars = Array.from(text);
    return chars.length <= limit ? text : must(parseText(`${chars.slice(0, limit - 1).join('').trimEnd()}${ELLIPSIS}`));
}

export function continuationNote(awaiting: Awaiting, background: readonly BackgroundItem[], limit: NoteLimit = NOTE_LIMIT): ContinuationNote | null {
    const parts = [...waitingPart(awaiting), ...runningPart(background)];
    return parts.length === 0 ? null : must(parseContinuationNote(cutNote(must(parseText(parts.join(' '))), limit)));
}

const LEADS = /Still (?:waiting for|running):/g;
const WORD = /[\p{L}\p{N}]+/gu;
const EDGE_BEFORE = '(?<![\\p{L}\\p{N}])';
const EDGE_AFTER = '(?![\\p{L}\\p{N}])';

const mentions = (brief: Text, word: Text): Mention => (new RegExp(`${EDGE_BEFORE}${word}${EDGE_AFTER}`, 'iu').test(brief) ? 'mentioned' : 'unmentioned');

export function keepsNote(brief: Text, note: Text): NoteFit {
    const words = (note.replaceAll(LEADS, ' ').match(WORD) ?? []).map((word) => must(parseText(word)));
    return words.every((word) => mentions(brief, word) === 'mentioned') ? 'kept' : 'dropped';
}

export function withNote(brief: Text, note: Text): Text {
    return keepsNote(brief, note) === 'kept' ? brief : must(parseText(`${brief} ${note}`));
}
