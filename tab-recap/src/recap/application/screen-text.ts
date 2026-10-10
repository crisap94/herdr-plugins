import type { Entry } from '#src/ports/transcripts.ts';

const BOX_ONLY = /^[\s\-_=─━═│┃┌┐└┘├┤┬┴┼╭╮╰╯▔▁|+]*$/u;
const CHROME: readonly RegExp[] = [
    /esc to interrupt/i,
    /shift\+tab to cycle/i,
    /\? for shortcuts/i,
    /^\s*⏵⏵/u,
    /(?:bypass permissions|auto-accept|auto mode) (?:on|off)/i,
    /\(ctrl\+[a-z] to [a-z ]+\)/i,
    /^\s*[✻✽✶✳✢·*] .*… \(\d+s/u,
    /^\s*[❯›>] *$/u,
];
const PARAGRAPH_CHARS = 2000;

const isChrome = (line: string): boolean => line !== '' && (BOX_ONLY.test(line) || CHROME.some((chrome) => chrome.test(line)));

export function cleanScreen(text: string): string {
    const kept: string[] = [];
    for (const raw of text.split('\n')) {
        const line = raw.trimEnd();
        const last = kept.findLast((earlier) => earlier !== '');
        if (!isChrome(line) && (line !== '' ? line !== last : kept.at(-1) !== '')) {
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

export function screenEntries(text: string): readonly Entry[] {
    return cleanScreen(text).split(/\n{2,}/).flatMap((paragraph) => {
        const pieces: Entry[] = [];
        for (let from = 0; from < paragraph.length; from += PARAGRAPH_CHARS) {
            pieces.push({ role: 'agent', text: paragraph.slice(from, from + PARAGRAPH_CHARS) });
        }
        return pieces;
    });
}
