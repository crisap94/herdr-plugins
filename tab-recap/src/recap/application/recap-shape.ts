import { SECTIONS } from '#src/i18n/sections.ts';
import { MAX_WORDS } from '#src/recap/domain/shape.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';

const NOTHING = new Set(['', '-', '—', '–', 'none', 'n/a', 'ninguno', 'ninguna', 'nada']);

export function tidy(raw: string, limit = MAX_WORDS): string {
    const words = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replaceAll('**', '').replace(/\s+/g, ' ').trim().split(' ').filter((word) => word !== '');
    const clipped = words.length > limit ? `${words.slice(0, limit).join(' ')}…` : words.join(' ');
    return NOTHING.has(clipped.toLowerCase()) ? '' : clipped;
}

export function objectIn(text: string): unknown {
    const from = text.indexOf('{');
    const to = text.lastIndexOf('}');
    return from >= 0 && to > from ? JSON.parse(text.slice(from, to + 1)) : undefined;
}

export function renderRecap(sections: RecapSections, headings: 'en' | 'es'): string {
    return SECTIONS.map((section) => {
        const body = section.id === 'goal' ? [sections.goal] : sections[section.id].map((line) => `- ${line}`);
        return `## ${section[headings]}\n${body.length === 0 || body[0] === '' ? '—' : body.join('\n')}`;
    }).join('\n\n');
}

export function headlineOf(sections: RecapSections): { readonly kind: 'needs' | 'now'; readonly text: string } | null {
    const needs = sections.needs[0];
    const now = sections.now[0];
    if (needs !== undefined) {
        return { kind: 'needs', text: needs };
    }
    return now === undefined ? null : { kind: 'now', text: now };
}
