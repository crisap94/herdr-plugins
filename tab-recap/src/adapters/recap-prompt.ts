import { languageName } from '#src/i18n/index.ts';
import { SECTIONS } from '#src/i18n/sections.ts';
import type { SectionId } from '#src/i18n/sections.ts';
import { CAPS, MAX_WORDS } from '#src/recap/domain/shape.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';

function languageLines(language: string, previous: string): string[] {
    const own = language === 'en' ? [] : [
        language === 'es'
            ? 'Write every value in Spanish (neutral Latin American, informal "tú"). Keep the JSON keys in English.'
            : `Write every value in ${languageName(language)}. Keep the JSON keys in English.`,
    ];
    const carried = previous === language ? [] : [
        `The PREVIOUS RECAP is in ${languageName(previous)}: carry over what is still relevant, rewritten in ${languageName(language)}.`,
    ];
    return [...own, ...carried, ...(own.length + carried.length > 0 ? [''] : [])];
}

const SHAPE = '{"goal": "...", "now": ["..."], "needs": ["..."], "done": ["..."], "decisions": ["..."], "next": ["..."], "links": ["..."]}';

const sectionLine = (section: { id: SectionId; hint: string }): string => {
    const size = section.id === 'goal' ? 'one line' : `at most ${CAPS[section.id]}`;
    return `${section.id.padEnd(10)}— ${section.hint} (${size})`;
};

/** The recap's fixed contract: one JSON object with seven keys. Every backend gets the same instructions. */
export function instructions(request: Pick<RecapRequest, 'language' | 'previousLanguage'>): string {
    return [
        'You keep a running recap of ONE terminal tab. The tab may hold several coding agents working',
        'side by side; the recap covers all of them as one piece of work. The operator reads it at a',
        'glance, often on a phone, so it must be short and easy to read.',
        '',
        'Rewrite the recap from the PREVIOUS RECAP plus the NEW TRANSCRIPT EXCERPT (one === section per',
        'agent). When several agents are involved, say which one by its short label.',
        '',
        'Answer with ONLY one JSON object: no other text, no code fence, exactly these keys:',
        SHAPE,
        '',
        ...SECTIONS.map(sectionLine),
        '',
        ...languageLines(request.language, request.previousLanguage),
        'How to write:',
        `- Plain everyday words. Short sentences in the present tense, ${MAX_WORDS} words or fewer per line.`,
        '- Name real things: file names, branch names, merge request numbers, commands, error messages.',
        '- No filler, no hedging, no jargon. One fact per line, never the same fact twice.',
        '- Keep what is still true from the previous recap, move finished work to "done", drop what no longer matters.',
        '- Never invent facts that are not in the inputs.',
        '- When a section has nothing to say, use an empty list [] ("" for goal). Never write "none".',
    ].join('\n');
}

export function message(request: RecapRequest): string {
    const previous = request.previous.trim() === '' ? '(none yet — this is the first recap)' : request.previous;
    const lanes = `Agents in this tab:\n${request.lanes.map((lane) => `- ${lane}`).join('\n')}\n\n`;
    const excerpt = request.excerpt.trim() === '' ? '(no new activity: only rewrite the recap as asked above)' : request.excerpt;
    const retry = request.correction === undefined ? '' : `\nYOUR LAST ANSWER WAS REJECTED: ${request.correction}. Answer again with ONLY the JSON object.\n`;
    return `${lanes}PREVIOUS RECAP:\n${previous}\n\nNEW TRANSCRIPT EXCERPT:\n${excerpt}\n${retry}`;
}

/** Models sometimes wrap the whole answer in a fence; the parser wants the JSON itself. */
export function unfenced(markdown: string): string {
    const trimmed = markdown.trim();
    const lines = trimmed.split('\n');
    if (lines.length >= 2 && (lines[0] ?? '').startsWith('```') && (lines.at(-1) ?? '') === '```') {
        return lines.slice(1, -1).join('\n').trim();
    }
    return trimmed;
}

/** What an argv-only harness is given: more than this risks E2BIG and a long process command line. */
export const ARGV_BYTES = 120_000;

/** `text` without its oldest lines until it fits `max` bytes (UTF-8); a lone overlong line loses its head. */
export function fitBytes(text: string, max: number): string {
    if (Buffer.byteLength(text) <= max) {
        return text;
    }
    const lines = text.split('\n');
    let used = 0;
    let from = lines.length;
    while (from > 0) {
        const need = Buffer.byteLength(lines[from - 1] ?? '') + (used > 0 ? 1 : 0);
        if (used + need > max) {
            break;
        }
        used += need;
        from -= 1;
    }
    const kept = lines.slice(from).join('\n');
    if (kept !== '') {
        return kept;
    }
    const chars = Array.from(lines.at(-1) ?? '');
    while (chars.length > 0 && Buffer.byteLength(chars.join('')) > max) {
        chars.splice(0, Math.max(1, Math.ceil(chars.length / 20)));
    }
    return chars.join('');
}

/** The one prompt for a harness that takes it as an argument: the excerpt is what gets trimmed. */
export function argvPrompt(request: RecapRequest): string {
    const head = `${instructions(request)}\n\n${message({ ...request, excerpt: '' })}`;
    const room = ARGV_BYTES - Buffer.byteLength(head);
    return `${instructions(request)}\n\n${message({ ...request, excerpt: fitBytes(request.excerpt, Math.max(0, room)) })}`;
}
