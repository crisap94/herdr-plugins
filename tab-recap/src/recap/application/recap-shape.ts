// The recap's fixed structure, as three pure functions: check what the writer returned, draw it,
// and read the bar's headline from it. Nothing here asks the model politely: the caps are enforced.
import { SECTIONS } from '#src/i18n/sections.ts';
import { CAPS, MAX_WORDS } from '#src/recap/domain/shape.ts';
import type { ListSection, RecapSections } from '#src/recap/domain/shape.ts';

export type Parsed = { readonly kind: 'sections'; readonly sections: RecapSections } | { readonly kind: 'invalid'; readonly why: string };

const NOTHING = new Set(['', '-', '—', '–', 'none', 'n/a', 'ninguno', 'ninguna', 'nada']);

/** One line: no bullet, no markdown emphasis, one space between words, at most MAX_WORDS words (clipped with `…`). */
export function tidy(raw: string): string {
    const words = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replaceAll('**', '').replace(/\s+/g, ' ').trim().split(' ').filter((word) => word !== '');
    const clipped = words.length > MAX_WORDS ? `${words.slice(0, MAX_WORDS).join(' ')}…` : words.join(' ');
    return NOTHING.has(clipped.toLowerCase()) ? '' : clipped;
}

function listOf(value: unknown, cap: number): string[] {
    const items: unknown[] = Array.isArray(value) ? value : [value];
    return items.flatMap((item: unknown) => (typeof item === 'string' ? [tidy(item)] : [])).filter((line) => line !== '').slice(0, cap);
}

/** The JSON object in the writer's answer: it may be fenced, or wrapped in a sentence. */
export function objectIn(text: string): unknown {
    const from = text.indexOf('{');
    const to = text.lastIndexOf('}');
    return from >= 0 && to > from ? JSON.parse(text.slice(from, to + 1)) : undefined;
}

const KEYS = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links'] as const;

/** The seven sections and `rules` in `fields`, checked and capped; a missing one is empty; null when it has none of them. */
export function sectionsFrom(fields: Readonly<Record<string, unknown>>): RecapSections | null {
    if (!KEYS.some((key) => key in fields)) {
        return null;
    }
    const list = (key: ListSection): string[] => listOf(fields[key], CAPS[key]);
    const goal = fields['goal'];
    return {
        goal: typeof goal === 'string' ? tidy(goal) : '',
        now: list('now'), needs: list('needs'), done: list('done'), decisions: list('decisions'), next: list('next'), links: list('links'), rules: list('rules'),
    };
}

/** Check and cap the writer's answer. A missing section is an empty one; no recognisable section at all is invalid. */
export function parseRecap(text: string): Parsed {
    let found: unknown;
    try {
        found = objectIn(text);
    } catch {
        return { kind: 'invalid', why: 'the answer is not valid JSON' };
    }
    if (typeof found !== 'object' || found === null || Array.isArray(found)) {
        return { kind: 'invalid', why: 'the answer holds no JSON object' };
    }
    const sections = sectionsFrom(found as Readonly<Record<string, unknown>>);
    return sections === null ? { kind: 'invalid', why: 'the JSON object has none of the seven sections' } : { kind: 'sections', sections };
}

/** The Markdown for the column: seven headings, always, in order; an empty section is `—`. */
export function renderRecap(sections: RecapSections, headings: 'en' | 'es'): string {
    return SECTIONS.map((section) => {
        const body = section.id === 'goal' ? [sections.goal] : sections[section.id].map((line) => `- ${line}`);
        return `## ${section[headings]}\n${body.length === 0 || body[0] === '' ? '—' : body.join('\n')}`;
    }).join('\n\n');
}

/** What the phone bar says: what needs the operator first, else what is happening now; null when both are empty. */
export function headlineOf(sections: RecapSections): { readonly kind: 'needs' | 'now'; readonly text: string } | null {
    const needs = sections.needs[0];
    const now = sections.now[0];
    if (needs !== undefined) {
        return { kind: 'needs', text: needs };
    }
    return now === undefined ? null : { kind: 'now', text: now };
}
