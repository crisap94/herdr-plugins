import type { Entry } from '#src/ports/transcripts.ts';

export interface ScreenChrome {
    readonly boxOnly: RegExp;
    readonly lines: readonly RegExp[];
}

const PARAGRAPH_CHARS = 2000;

const isChrome = (line: string, chrome: ScreenChrome): boolean => line !== '' && (chrome.boxOnly.test(line) || chrome.lines.some((pattern) => pattern.test(line)));

export function cleanScreen(text: string, chrome: ScreenChrome): string {
    const kept: string[] = [];
    for (const raw of text.split('\n')) {
        const line = raw.trimEnd();
        const last = kept.findLast((earlier) => earlier !== '');
        if (!isChrome(line, chrome) && (line !== '' ? line !== last : kept.at(-1) !== '')) {
            kept.push(line);
        }
    }
    return kept.join('\n').trim();
}

const STEADY_LINES = 40;

export function steady(clean: string): string {
    const lines = clean.replace(/\d+/g, '#').split('\n').map((line) => line.trim()).filter((line) => line !== '');
    return [...new Set(lines.toReversed())].slice(0, STEADY_LINES).toSorted().join('\n');
}

export function screenEntries(text: string, chrome: ScreenChrome): readonly Entry[] {
    return cleanScreen(text, chrome).split(/\n{2,}/).flatMap((paragraph) => {
        const pieces: Entry[] = [];
        for (let from = 0; from < paragraph.length; from += PARAGRAPH_CHARS) {
            pieces.push({ role: 'agent', text: paragraph.slice(from, from + PARAGRAPH_CHARS) });
        }
        return pieces;
    });
}
