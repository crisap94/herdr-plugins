import { languageName } from '#src/i18n/index.ts';
import { SECTIONS } from '#src/i18n/sections.ts';
import type { SectionId } from '#src/i18n/sections.ts';
import { CAPS, MAX_WORDS } from '#src/recap/domain/shape.ts';
import type { LaneHint, RecapRequest, TaskGroup } from '#src/ports/summarizer.ts';

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

const SECTION_KEYS = '"goal": "...", "now": ["..."], "needs": ["..."], "done": ["..."], "decisions": ["..."], "next": ["..."], "links": ["..."]';
const SHAPE = `{${SECTION_KEYS}}`;
const TASKS_SHAPE = `{"regroup": "", "tasks": [{"name": "...", "lanes": ["<pane id>"], ${SECTION_KEYS}}]}`;

/** With two or more lanes the writer also decides which of them work on the same thing. */
const groups = (request: Pick<RecapRequest, 'hints'>): boolean => (request.hints?.length ?? 0) > 1;

const TASK_RULES: readonly string[] = [
    'The agents of a tab may work on ONE task or on several unrelated ones. Group them: agents on the same',
    'piece of work share a task; unrelated work is a task of its own (one task per agent is fine). Use the',
    'AGENT HINTS (directory, repository, branch, files, title) and what each agent says. The same repository',
    'and branch, or one agent continuing the other\'s work, is one task; different repositories rarely are.',
    'Every agent is in exactly one task, named by its pane id in "lanes". "name" is 2 to 5 words saying what',
    'the task is ("" when there is a single task). Each task has its own seven sections.',
    'KEEP the CURRENT TASKS (same lanes together, same names) unless the evidence is clear — e.g. the agents now',
    'work in different repositories, or one clearly started something unrelated. Then, and only then, say why',
    'in "regroup" (one short sentence). When you keep the grouping, "regroup" is "".',
    '',
];
const sectionLine = (section: { id: SectionId; hint: string }): string => {
    const size = section.id === 'goal' ? 'one line' : `at most ${CAPS[section.id]}`;
    return `${section.id.padEnd(10)}— ${section.hint} (${size})`;
};

/** The recap's fixed contract: one JSON object with seven keys. Every backend gets the same instructions. */
export function instructions(request: Pick<RecapRequest, 'language' | 'previousLanguage' | 'hints'>): string {
    const tasks = groups(request);
    return [
        'You keep a running recap of ONE terminal tab. The tab may hold several coding agents working',
        tasks ? 'side by side. The operator reads it at a glance, often on a phone, so it must be short and easy to read.' : 'side by side; the recap covers all of them as one piece of work. The operator reads it at a',
        ...(tasks ? [] : ['glance, often on a phone, so it must be short and easy to read.']),
        '',
        tasks ? 'Rewrite each task\'s recap from the PREVIOUS RECAP plus the NEW TRANSCRIPT EXCERPT (one === section per' : 'Rewrite the recap from the PREVIOUS RECAP plus the NEW TRANSCRIPT EXCERPT (one === section per',
        'agent). When several agents are involved, say which one by its short label.',
        '',
        ...(tasks ? TASK_RULES : []),
        'Answer with ONLY one JSON object: no other text, no code fence, exactly these keys:',
        tasks ? TASKS_SHAPE : SHAPE,
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

const hintLine = (hint: LaneHint): string => {
    const where = [hint.cwd === null ? null : `cwd ${hint.cwd}`, hint.repo === null ? null : `repo ${hint.repo}`, hint.branch === null ? null : `branch ${hint.branch}`];
    const files = hint.files.length === 0 ? null : `edited ${hint.files.join(', ')}`;
    return `- ${hint.pane} (${hint.label}): ${[...where, files].filter((part) => part !== null).join('; ') || 'nothing known'}`;
};

const groupLine = (group: TaskGroup): string => `- ${group.id}${group.name === '' ? '' : ` "${group.name}"`}: ${group.lanes.join(', ')}`;

function taskLines(request: RecapRequest): string {
    if (!groups(request)) {
        return '';
    }
    const current = request.grouping ?? [];
    const was = current.length === 0 ? '(none yet — group the agents)' : current.map(groupLine).join('\n');
    return `AGENT HINTS:\n${(request.hints ?? []).map(hintLine).join('\n')}\n\nCURRENT TASKS:\n${was}\n\n`;
}

export function message(request: RecapRequest): string {
    const previous = request.previous.trim() === '' ? '(none yet — this is the first recap)' : request.previous;
    const lanes = `Agents in this tab:\n${request.lanes.map((lane) => `- ${lane}`).join('\n')}\n\n${taskLines(request)}`;
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
