// Pure text layout for a narrow column. No I/O.
import type { AgoUnit } from '#src/i18n/messages.ts';

const ESC = String.fromCodePoint(0x1b);

/** Length as the terminal shows it: ANSI escapes take no cells. */
export function visibleLength(text: string): number {
    let length = 0;
    let inEscape = false;
    for (const ch of text) {
        if (ch === ESC) {
            inEscape = true;
        } else if (inEscape) {
            inEscape = !(ch >= '@' && ch <= '~' && ch !== '[');
        } else {
            length++;
        }
    }
    return length;
}

/** Word-wraps plain text; a word longer than the width is cut. `hang` indents continuation lines. */
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
            lines.push(rest.slice(0, room));
            rest = `${hang}${rest.slice(room)}`;
        }
        line = rest;
    }
    if (line !== '' || lines.length === 0) {
        lines.push(line);
    }
    return lines;
}

export const style = {
    bold: (s: string): string => `${ESC}[1m${s}${ESC}[22m`,
    dim: (s: string): string => `${ESC}[2m${s}${ESC}[22m`,
    italic: (s: string): string => `${ESC}[3m${s}${ESC}[23m`,
    red: (s: string): string => `${ESC}[31m${s}${ESC}[39m`,
    green: (s: string): string => `${ESC}[32m${s}${ESC}[39m`,
    yellow: (s: string): string => `${ESC}[33m${s}${ESC}[39m`,
    blue: (s: string): string => `${ESC}[34m${s}${ESC}[39m`,
    magenta: (s: string): string => `${ESC}[35m${s}${ESC}[39m`,
    cyan: (s: string): string => `${ESC}[36m${s}${ESC}[39m`,
    gray: (s: string): string => `${ESC}[90m${s}${ESC}[39m`,
};

function markdownLine(raw: string, width: number): string[] {
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
export function plainMarkdown(markdown: string, width: number): string[] {
    const lines = markdown.split('\n').flatMap((raw) => markdownLine(raw, width)).filter((line, at, all) => line !== '' || all[at - 1] !== '');
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
