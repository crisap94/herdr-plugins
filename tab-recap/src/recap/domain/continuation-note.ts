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
