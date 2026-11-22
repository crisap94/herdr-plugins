import type { Break } from './model.ts';
import { assertCount, assertMinutes, assertSeconds } from './wording.ts';
import type { TextChapters } from './wording.ts';
import { tokensOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/compaction.ts';
import { countOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/count.ts';

const RULE = '─';
const SIDE = RULE.repeat(2);

function took(ms: number, say: TextChapters): string {
    const seconds = Math.max(1, Math.round(ms / 1000));
    const [minutes, rest] = [Math.floor(seconds / 60), seconds % 60];
    assertSeconds(seconds);
    assertMinutes(minutes);
    assertSeconds(rest);
    return seconds < 60 ? say.seconds(seconds) : say.minutes(minutes, rest);
}

export function breakText(found: Break, say: TextChapters): string {
    if (found.kind === 'switched') {
        return say.newSession;
    }
    const sizes = found.tokensBefore !== null && found.tokensAfter !== null ? `${tokensOf(countOf(found.tokensBefore))} → ${tokensOf(countOf(found.tokensAfter))}` : '';
    const time = found.tookMs === null ? '' : took(found.tookMs, say);
    const detail = [sizes, time].filter((part) => part !== '').join(' · ');
    return detail === '' ? say.compacted : `${say.compacted} ${detail}`;
}

export function breakLine(found: Break, say: TextChapters, width: number | null = null): string {
    const text = breakText(found, say);
    const open = `${SIDE} ${text} `;
    if (width === null) {
        return `${open}${SIDE}`;
    }
    const room = Math.max(0, width - SIDE.length - 2);
    const shown = text.length > room ? `${text.slice(0, Math.max(0, room - 1))}…` : text;
    const line = `${SIDE} ${shown} `;
    return `${line}${RULE.repeat(Math.max(SIDE.length, width - line.length))}`;
}

export const chaptersFact = (chapters: number, say: TextChapters): string => {
    assertCount(chapters);
    return say.count(chapters);
};
