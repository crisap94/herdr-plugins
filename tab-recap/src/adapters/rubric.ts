import { readFileSync } from 'node:fs';

export interface Rubric {
    readonly items: string;
    readonly sections: string;
    readonly whole: string;
}

const RUBRIC_FILE = new URL('../../schema/recap-rubric.md', import.meta.url);

export function partOf(markdown: string, title: string): string {
    const parts = markdown.split(/^## /m).slice(1);
    const found = parts.find((part) => part.startsWith(title));
    return found === undefined ? '' : found.slice(found.indexOf('\n') + 1).trim();
}

export const rubricOf = (markdown: string): Rubric => ({
    items: partOf(markdown, 'Every item'),
    sections: partOf(markdown, 'Per section'),
    whole: partOf(markdown, 'Whole recap'),
});

export const RUBRIC_TEXT: string = readFileSync(RUBRIC_FILE, 'utf8');

export const RUBRIC: Rubric = rubricOf(RUBRIC_TEXT);
