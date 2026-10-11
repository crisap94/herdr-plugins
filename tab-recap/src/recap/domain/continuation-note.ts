import type { Brand } from './brand.ts';
import { plainText } from './coordination.ts';
import type { Awaiting, BackgroundItem } from './in-flight.ts';

export type ContinuationNote = Brand<string, 'ContinuationNote'>;
export type NoteLimit = Brand<number, 'NoteLimit'>;

export const NOTE_LIMIT = 400 as NoteLimit;

const ELLIPSIS = '…';

const plain = (text: string): string => plainText(text.replaceAll(/\p{Cf}/gu, ' ').replaceAll('"', "'").replaceAll(/\s+/g, ' '));

const itemText = (item: BackgroundItem): string => `${plain(String(item.tool))} "${plain(String(item.label))}"`;

function waitingPart(awaiting: Awaiting): string[] {
    return awaiting.kind === 'on' ? [`Still waiting for: ${plain(String(awaiting.names))}.`] : [];
}

function runningPart(background: readonly BackgroundItem[]): string[] {
    return background.length === 0 ? [] : [`Still running: ${background.map(itemText).join(', ')}.`];
}

export function cutNote(text: string, limit: NoteLimit): string {
    const chars = Array.from(text);
    return chars.length <= limit ? text : `${chars.slice(0, limit - 1).join('').trimEnd()}${ELLIPSIS}`;
}

export function continuationNote(awaiting: Awaiting, background: readonly BackgroundItem[], limit: NoteLimit = NOTE_LIMIT): ContinuationNote | null {
    const parts = [...waitingPart(awaiting), ...runningPart(background)];
    return parts.length === 0 ? null : (cutNote(parts.join(' '), limit) as ContinuationNote);
}

const LEADS = /Still (?:waiting for|running):/g;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}_-]{3,}/gu;

export function keepsNote(brief: string, note: string): boolean {
    const text = brief.toLowerCase();
    const words = note.replaceAll(LEADS, ' ').match(WORD) ?? [];
    return words.every((word) => text.includes(word.toLowerCase()));
}

export function withNote(brief: string, note: string): string {
    return keepsNote(brief, note) ? brief : `${brief} ${note}`;
}
