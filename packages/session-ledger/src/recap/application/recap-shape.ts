import type { Count } from '#src/contract/kernel.ts';
import { SECTIONS } from '#src/i18n/sections.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import { MAX_WORDS } from '#src/recap/domain/shape.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

const textOf = brand<string, 'Text'>;

export type Headings = 'en' | 'es';
export type HeadlineKind = 'needs' | 'now';
export type ParsedObject = Brand<object, 'ParsedObject'>;

export interface Headline {
    readonly kind: HeadlineKind;
    readonly text: Text;
}

const WORDS_KEPT = brand<number, 'Count'>(MAX_WORDS);
const NOTHING = new Set(['', '-', '—', '–', 'none', 'n/a', 'ninguno', 'ninguna', 'nada']);

export function tidy(raw: Text, limit: Count = WORDS_KEPT): Text {
    const words = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replaceAll('**', '').replace(/\s+/g, ' ').trim().split(' ').filter((word) => word !== '');
    const clipped = words.length > limit ? `${words.slice(0, limit).join(' ')}…` : words.join(' ');
    return textOf(NOTHING.has(clipped.toLowerCase()) ? '' : clipped);
}

function objectFrom(json: Text): ParsedObject {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('the braced text is not a JSON object');
    }
    return brand<object, 'ParsedObject'>(parsed);
}

const TOKENS = /"(?:[^"\\]|\\.)*"|[{}]/g;

export function objectIn(text: Text): ParsedObject | undefined {
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
                return objectFrom(textOf(text.slice(from, from + token.index + 1)));
            } catch {
                break;
            }
        }
    }
    return objectFrom(textOf(text.slice(from, to + 1)));
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
        if (value === undefined || Array.isArray(value)) {
            return answer;
        }
        const text = parseText(JSON.stringify(value));
        return text.kind === 'ok' ? text.value : answer;
    }
}

export function renderRecap(sections: RecapSections, headings: Headings): Text {
    return textOf(SECTIONS.map((section) => {
        const body = section.id === 'goal' ? [sections.goal] : sections[section.id].map((line) => `- ${line}`);
        return `## ${section[headings]}\n${body.length === 0 || body[0] === '' ? '—' : body.join('\n')}`;
    }).join('\n\n'));
}

export function headlineOf(sections: RecapSections): Headline | null {
    const needs = sections.needs[0];
    const now = sections.now[0];
    if (needs !== undefined) {
        return { kind: 'needs', text: textOf(needs) };
    }
    return now === undefined ? null : { kind: 'now', text: textOf(now) };
}
