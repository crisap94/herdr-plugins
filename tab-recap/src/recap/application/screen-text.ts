import type { Entry } from '@stateforge-labs/session-ledger';
import { textOf, type Text } from '@stateforge-labs/session-ledger';

export interface ScreenChrome {
    readonly boxOnly: RegExp;
    readonly lines: readonly RegExp[];
}

const PARAGRAPH_CHARS = 2000;

type LineKind = 'chrome' | 'content';

const kindOf = (line: Text, chrome: ScreenChrome): LineKind => (line !== '' && (chrome.boxOnly.test(line) || chrome.lines.some((pattern) => pattern.test(line))) ? 'chrome' : 'content');

export function cleanScreen(text: Text, chrome: ScreenChrome): Text {
    const kept: Text[] = [];
    for (const raw of text.split('\n')) {
        const line = textOf(raw.trimEnd());
        const last = kept.findLast((earlier) => earlier !== '');
        if (kindOf(line, chrome) === 'content' && (line !== '' ? line !== last : kept.at(-1) !== '')) {
            kept.push(line);
        }
    }
    return textOf(kept.join('\n').trim());
}

const STEADY_LINES = 40;

export function steady(clean: Text): Text {
    const lines = clean.replace(/\d+/g, '#').split('\n').map((line) => line.trim()).filter((line) => line !== '');
    return textOf([...new Set(lines.toReversed())].slice(0, STEADY_LINES).toSorted().join('\n'));
}

export function screenEntries(text: Text, chrome: ScreenChrome): readonly Entry[] {
    return cleanScreen(text, chrome).split(/\n{2,}/).flatMap((paragraph) => {
        const pieces: Entry[] = [];
        for (let from = 0; from < paragraph.length; from += PARAGRAPH_CHARS) {
            pieces.push({ role: 'agent', text: textOf(paragraph.slice(from, from + PARAGRAPH_CHARS)) });
        }
        return pieces;
    });
}
