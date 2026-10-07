// The timeline's break lines, pure: the timeline merges them with the facts by time and draws them in gray across the column.
import type { Messages } from '#src/i18n/index.ts';
import type { Break } from '#src/ports/boundaries.ts';
import { tokensOf } from '#src/recap/domain/compaction.ts';

const RULE = '─';
const SIDE = RULE.repeat(2);

/** `16 s`, `1 min 5 s`: whole seconds, never `0 s` for a time that was measured. */
function took(ms: number, say: Messages['chapters']): string {
    const seconds = Math.max(1, Math.round(ms / 1000));
    return seconds < 60 ? say.seconds(seconds) : say.minutes(Math.floor(seconds / 60), seconds % 60);
}

/** What the line says between its rules: tokens before → after and the time, each only when the records gave it. */
export function breakText(found: Break, say: Messages['chapters']): string {
    if (found.kind === 'switched') {
        return say.newSession;
    }
    const sizes = found.tokensBefore !== null && found.tokensAfter !== null ? `${tokensOf(found.tokensBefore)} → ${tokensOf(found.tokensAfter)}` : '';
    const time = found.tookMs === null ? '' : took(found.tookMs, say);
    const detail = [sizes, time].filter((part) => part !== '').join(' · ');
    return detail === '' ? say.compacted : `${say.compacted} ${detail}`;
}

/**
 * One break line: `── compacted 800k → 14k · 16 s ──`, `── compacted ──` when the records gave no numbers, `── new session ──`.
 * With a `width` the closing rule runs to the edge of the column; text that does not fit is cut with `…`.
 */
export function breakLine(found: Break, say: Messages['chapters'], width: number | null = null): string {
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

/** The session facts' chapter count: `chapters 3`. */
export const chaptersFact = (chapters: number, say: Messages['chapters']): string => say.count(chapters);
