// Pure text layout for a narrow column. No I/O.
import { stripVTControlCharacters, styleText } from 'node:util';
import type { AgoUnit } from '#src/i18n/messages.ts';

const ESC = String.fromCodePoint(0x1b);
const CSI = new RegExp(`(${ESC}\\[[0-?]*[ -/]*[@-~])`, 'u');
const EMOJI = /\p{Extended_Pictographic}/u;
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}|\uFE0F/u;
const FLAG = /^\p{Regional_Indicator}{2}$/u;
const MARKS_ONLY = /^\p{M}+$/u;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Cells one user-perceived character takes: emoji presentation (or a flag) 2, combining marks alone 0, else 1. */
function cellsOf(character: string): number {
    if (MARKS_ONLY.test(character)) {
        return 0;
    }
    return (EMOJI.test(character) && EMOJI_PRESENTATION.test(character)) || FLAG.test(character) ? 2 : 1;
}

/** Width as the terminal draws it: escapes take no cells, an emoji two, a combining mark none. */
export function visibleLength(text: string): number {
    let cells = 0;
    for (const { segment } of graphemes.segment(stripVTControlCharacters(text))) {
        cells += cellsOf(segment);
    }
    return cells;
}

/** Splits `text` after the last whole character that fits in `room` cells; escapes ride along and take none. */
function cut(text: string, room: number): [string, string] {
    let cells = 0;
    let head = '';
    const pieces = text.split(CSI);
    for (const [at, piece] of pieces.entries()) {
        if (at % 2 === 1) {
            head += piece;
            continue;
        }
        for (const { segment, index } of graphemes.segment(piece)) {
            cells += cellsOf(segment);
            if (cells > room && head !== '') {
                return [head, `${piece.slice(index)}${pieces.slice(at + 1).join('')}`];
            }
            head += segment;
        }
    }
    return [head, ''];
}

/** Word-wraps plain text; a word longer than the width is cut between characters. `hang` indents continuation lines. */
export function wrap(text: string, width: number, hang = ''): string[] {
    const room = Math.max(8, width);
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(' ').filter((w) => w !== '')) {
        const candidate = line === '' ? word : `${line} ${word}`;
        if (visibleLength(candidate) <= room) {
            line = candidate;
            continue;
        }
        if (line !== '') {
            lines.push(line);
        }
        let rest = `${hang}${word}`;
        while (visibleLength(rest) > room) {
            const [head, tail] = cut(rest, room);
            lines.push(head);
            rest = `${hang}${tail}`;
        }
        line = rest;
    }
    if (line !== '' || lines.length === 0) {
        lines.push(line);
    }
    return lines;
}

export type StyleName = 'bold' | 'dim' | 'italic' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'gray';
export type Style = Readonly<Record<StyleName, (text: string) => string>>;

const STYLE_NAMES: readonly StyleName[] = ['bold', 'dim', 'italic', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'gray'];

/** Colours and styles; `validateStream: false` keeps rendering pure: the composition root decides whether to use them. */
export const coloured: Style = Object.fromEntries(
    STYLE_NAMES.map((name) => [name, (text: string): string => styleText(name, text, { validateStream: false })]),
) as Style;

/** The same keys with no escape sequences, for a terminal that asks for none. */
export const plain: Style = Object.fromEntries(STYLE_NAMES.map((name) => [name, (text: string): string => text])) as Style;

function markdownLine(raw: string, width: number, style: Style): string[] {
    const line = raw.trimEnd();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading !== null) {
        return ['', style.bold(style.cyan((heading[1] ?? '').toUpperCase()))];
    }
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (bullet !== null) {
        const depth = Math.min(2, Math.floor((bullet[1] ?? '').length / 2));
        const pad = '  '.repeat(depth);
        return wrap(`${pad}• ${(bullet[2] ?? '').replaceAll('**', '').replaceAll('`', '')}`, width, `${pad}  `);
    }
    return line === '' ? [''] : wrap(line.replaceAll('**', '').replaceAll('`', ''), width);
}

/** The renderer used when glow is not installed: headings, bullets, wrapped paragraphs. */
export function plainMarkdown(markdown: string, width: number, style: Style = coloured): string[] {
    const lines = markdown.split('\n').flatMap((raw) => markdownLine(raw, width, style)).filter((line, at, all) => line !== '' || all[at - 1] !== '');
    while (lines[0] === '') {
        lines.shift();
    }
    return lines;
}

/** How long ago, as an amount and a unit; the catalog says it in words. */
export function elapsed(ms: number): { amount: number; unit: AgoUnit } {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) {
        return { amount: s, unit: 's' };
    }
    if (s < 3600) {
        return { amount: Math.floor(s / 60), unit: 'min' };
    }
    return s < 86_400 ? { amount: Math.floor(s / 3600), unit: 'h' } : { amount: Math.floor(s / 86_400), unit: 'd' };
}
