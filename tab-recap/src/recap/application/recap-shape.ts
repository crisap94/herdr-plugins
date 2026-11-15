import { SECTIONS } from '#src/i18n/sections.ts';
import { MAX_WORDS } from '#src/recap/domain/shape.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

const NOTHING = new Set(['', '-', '—', '–', 'none', 'n/a', 'ninguno', 'ninguna', 'nada']);

export function tidy(raw: string, limit = MAX_WORDS): string {
    const words = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replaceAll('**', '').replace(/\s+/g, ' ').trim().split(' ').filter((word) => word !== '');
    const clipped = words.length > limit ? `${words.slice(0, limit).join(' ')}…` : words.join(' ');
    return NOTHING.has(clipped.toLowerCase()) ? '' : clipped;
}

const TOKENS = /"(?:[^"\\]|\\.)*"|[{}]/g;

export function objectIn(text: string): unknown {
    const from = text.indexOf('{');
    const to = text.lastIndexOf('}');
    if (from < 0 || to <= from) {
        return undefined;
    }
    let depth = 0;
    for (const token of text.slice(from).matchAll(TOKENS)) {
        depth += Number(token[0] === '{') - Number(token[0] === '}');
        if (depth === 0) {
            try {
                return JSON.parse(text.slice(from, from + token.index + 1));
            } catch {
                break;
            }
        }
    }
    return JSON.parse(text.slice(from, to + 1));
}

export function answerTextOf(answer: Text): Text {
    try {
        JSON.parse(answer);
        return answer;
    } catch {
        let value;
        try {
            value = objectIn(answer);
        } catch {
            return answer;
        }
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return answer;
        }
        const text = parseText(JSON.stringify(value));
        return text.kind === 'ok' ? text.value : answer;
    }
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
