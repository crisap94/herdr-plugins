import { readFileSync } from 'node:fs';

export const RUBRIC_TEXT = readFileSync(new URL('../schema/recap-rubric.md', import.meta.url), 'utf8');

export interface Examples {
    readonly pass: string;
    readonly fail: string;
}

export function examplesOf(id: string): Examples {
    const block = RUBRIC_TEXT.split('\n- **').find((part) => new RegExp(`^${id}(?![\\w-])`).test(part)) ?? '';
    const quoted = (label: string): string => new RegExp(`- ${label}: "([^\\n]*?)"(?: \\(|$)`, 'm').exec(block)?.[1] ?? '';
    return { pass: quoted('pass'), fail: quoted('fail') };
}

export const checkIds = (): readonly string[] => [...RUBRIC_TEXT.matchAll(/^- \*\*(I\d|S-[a-z]+)(?![\w-])/gm)].map((found) => found[1] ?? '');
