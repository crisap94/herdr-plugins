import type { Graded, Mark } from './types.ts';

export const squashed = (text: string): string => text.replace(/\s+/g, ' ').trim();

export function stripFences(text: string): string {
    return text.trim().replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
}

export function parseJson(text: string): unknown {
    try {
        return JSON.parse(stripFences(text));
    } catch {
        return null;
    }
}

export function quoted(evidence: string, sources: readonly string[]): boolean {
    const fragments = evidence.split(/\.\.\.|…/).map(squashed).filter((fragment) => fragment !== '');
    if (fragments.length === 0) return false;
    const haystacks = sources.map(squashed);
    return fragments.every((fragment) => haystacks.some((haystack) => haystack.includes(fragment)));
}

export function sameSet(first: readonly string[], second: readonly string[]): boolean {
    const a = new Set(first);
    const b = new Set(second);
    return a.size === b.size && [...a].every((value) => b.has(value));
}

export const subsetOf = (part: readonly string[], whole: readonly string[]): boolean => part.every((value) => whole.includes(value));

export const disjoint = (first: readonly string[], second: readonly string[]): boolean => first.every((value) => !second.includes(value));

export function unparsed(criteria: readonly string[]): Graded {
    const marks: Record<string, Mark> = {};
    for (const criterion of criteria) marks[criterion] = false;
    return { parsed: false, marks };
}
