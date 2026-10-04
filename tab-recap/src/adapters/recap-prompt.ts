import { languageName } from '#src/i18n/index.ts';
import { SECTIONS } from '#src/i18n/sections.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';

/** Spanish has its own headings; every other language keeps the English ones so the column can read them. */
const headingsOf = (language: string): 'en' | 'es' => (language === 'es' ? 'es' : 'en');

const doneHeading = (headings: 'en' | 'es'): string => SECTIONS.find((section) => section.id === 'done')?.[headings] ?? 'Done';

function languageLines(language: string, previous: string): string[] {
    const own = language === 'en' ? [] : [
        language === 'es'
            ? 'Write the recap in Spanish (neutral Latin American, informal "tú"), using the Spanish section headings below exactly as given.'
            : `Write the recap in ${languageName(language)}: translate only the content, keep the section headings below exactly as given, in English.`,
    ];
    const carried = previous === language ? [] : [
        `The PREVIOUS RECAP is in ${languageName(previous)}: carry over what is still relevant, rewritten in ${languageName(language)} under the headings below.`,
    ];
    return [...own, ...carried, ...(own.length + carried.length > 0 ? [''] : [])];
}

/** The recap's fixed shape. Every backend gets the same instructions; the sections come from SECTIONS. */
export function instructions(request: Pick<RecapRequest, 'words' | 'language' | 'previousLanguage'>): string {
    const headings = headingsOf(request.language);
    return [
        'You keep a running recap of ONE terminal tab. The tab may hold several coding agents working',
        'side by side; the recap covers all of them as one piece of work. It is shown in a tall, narrow',
        'column beside them so the operator never loses track of what is going on in this tab.',
        '',
        'Rewrite the recap from the PREVIOUS RECAP plus the NEW TRANSCRIPT EXCERPT (one === section per',
        'agent). When there are several agents, say which one did what by its short label. Output ONLY',
        'Markdown, no preamble, using exactly these sections in this order (omit a section only if empty):',
        '',
        ...languageLines(request.language, request.previousLanguage),
        ...SECTIONS.map((section) => `## ${section[headings].padEnd(Math.max(16, section[headings].length + 1))}— ${section.hint}`),
        '',
        `Length: about ${request.words} words — the column has room, so be specific rather than terse.`,
        'Bullets short (≤ 16 words), one fact each. Name real things: paths, branch names, MR numbers,',
        'commands, error messages. Keep still-relevant items from the previous recap, move finished',
        `work to ${doneHeading(headings)}, drop what is obsolete. Never invent facts that are not in the inputs.`,
    ].join('\n');
}

export function message(request: RecapRequest): string {
    const previous = request.previous.trim() === '' ? '(none yet — this is the first recap)' : request.previous;
    const lanes = `Agents in this tab:\n${request.lanes.map((lane) => `- ${lane}`).join('\n')}\n\n`;
    const excerpt = request.excerpt.trim() === '' ? '(no new activity: only rewrite the recap as asked above)' : request.excerpt;
    return `${lanes}PREVIOUS RECAP:\n${previous}\n\nNEW TRANSCRIPT EXCERPT:\n${excerpt}\n`;
}

/** Models sometimes wrap the whole answer in a fence; the column wants the Markdown itself. */
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
    while (lines.length > 1 && Buffer.byteLength(lines.join('\n')) > max) {
        lines.shift();
    }
    const chars = Array.from(lines.join('\n'));
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
