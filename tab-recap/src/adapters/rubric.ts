// The rubric file, read once and cut into its three parts. One source: the writer's and the judge's instructions embed these texts.
import { readFileSync } from 'node:fs';

export interface Rubric {
    /** "Every item": the item checks I1…I7, as written in the file */
    readonly items: string;
    /** "Per section": the section checks S-<section> */
    readonly sections: string;
    /** "Whole recap (judge only)": coverage, filler, read-back */
    readonly whole: string;
}

const RUBRIC_FILE = new URL('../../schema/recap-rubric.md', import.meta.url);

/** The text under the heading that starts with `title`, up to the next `## ` heading. */
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

/** The whole file, as the judge's document carries it. */
export const RUBRIC_TEXT: string = readFileSync(RUBRIC_FILE, 'utf8');

export const RUBRIC: Rubric = rubricOf(RUBRIC_TEXT);
