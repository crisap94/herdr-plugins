// A lane's screen as the recap writer should read it: the agent's chrome (borders, key hints, spinners)
// is not news. Pure; what is left is split into paragraphs, one entry each.
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
/** a paragraph is cut here, so one entry never runs past what the excerpt clips each entry to */
const PARAGRAPH_CHARS = 2000;

const isChrome = (line: string): boolean => line !== '' && (BOX_ONLY.test(line) || CHROME.some((chrome) => chrome.test(line)));

/**
 * The screen without chrome, without runs of blank lines and without a line repeated right after itself (an
 * agent that prints the same notice every few seconds); empty when nothing but chrome was there.
 */
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

/** how many distinct lines, newest first, say whether a screen is still the same one */
const STEADY_LINES = 40;

/**
 * What "the same screen" means: the SET of its newest distinct lines, counters ignored. A TUI repaints its history,
 * so the same words come back in another order or twice (and the oldest ones slide out of the window we read), and
 * elapsed seconds, token counts and clocks tick on an idle screen.
 */
export function steady(clean: string): string {
    const lines = clean.replace(/\d+/g, '#').split('\n').map((line) => line.trim()).filter((line) => line !== '');
    return [...new Set(lines.toReversed())].slice(0, STEADY_LINES).toSorted().join('\n');
}

/** Paragraphs (blank-line separated), each one `agent` entry, none longer than PARAGRAPH_CHARS. */
export function screenEntries(text: string): readonly Entry[] {
    return cleanScreen(text).split(/\n{2,}/).flatMap((paragraph) => {
        const pieces: Entry[] = [];
        for (let from = 0; from < paragraph.length; from += PARAGRAPH_CHARS) {
            pieces.push({ role: 'agent', text: paragraph.slice(from, from + PARAGRAPH_CHARS) });
        }
        return pieces;
    });
}
