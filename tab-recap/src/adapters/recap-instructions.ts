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
        `The <previous_recap> is in ${languageName(previous)}: carry over what is still relevant, rewritten in ${languageName(language)}.`,
    ];
    return [...own, ...carried, ...(own.length + carried.length > 0 ? [''] : [])];
}

const SECTION_KEYS = '"goal": "...", "now": ["..."], "needs": ["..."], "done": ["..."], "decisions": ["..."], "next": ["..."], "links": ["..."]';
const SHAPE = `{${SECTION_KEYS}}`;
const TASKS_SHAPE = `{"regroup": "", "tasks": [{"name": "...", "lanes": ["<pane id>"], ${SECTION_KEYS}}]}`;

/** With two or more agents the writer also decides which of them work on the same thing. */
const groups = (request: Pick<RecapRequest, 'input'>): boolean => request.input.agents.length > 1;

const inputRules = (tasks: boolean): readonly string[] => [
    `Input: <recap_input>. Rewrite ${tasks ? 'each task\'s' : 'the'} recap from <previous_recap> plus what is NEW in each <transcript>.`,
    '<agent_note> = the agent\'s own summary: a hint, the transcript wins. Times are HH:MM: order "done" by them, say how',
    'long the operator waits. Empty <transcript>: just rewrite. Name agents by label.',
    '',
];

const TASK_RULES: readonly string[] = [
    'The agents of a tab may work on ONE task or on several unrelated ones. Group them: agents on the same',
    'piece of work share a task; unrelated work is a task of its own (one task per agent is fine). Use the',
    '<agent> details (directory, repository, branch, files, label) and what each agent says. The same repository',
    'and branch, or one agent continuing the other\'s work, is one task; different repositories rarely are.',
    'Every agent is in exactly one task, named by its pane id in "lanes". "name" is 2 to 5 words saying what',
    'the task is ("" when there is a single task). Each task has its own seven sections.',
    'KEEP the <current_tasks> (same agents together, same names) unless the evidence is clear — e.g. the agents now',
    'work in different repositories, or one clearly started something unrelated. Then, and only then, say why',
    'in "regroup" (one short sentence). When you keep the grouping, "regroup" is "". Without <current_tasks>, group the agents.',
    '',
];

const sectionLine = (section: { id: SectionId; hint: string }): string => {
    const size = section.id === 'goal' ? 'one line' : `at most ${CAPS[section.id]}`;
    return `${section.id.padEnd(10)}— ${section.hint} (${size})`;
};

/** The recap's fixed contract: one JSON object with seven keys. Every backend gets the same instructions, after the data. */
export function instructions(request: Pick<RecapRequest, 'language' | 'previousLanguage' | 'input'>): string {
    const tasks = groups(request);
    return [
        'You keep a running recap of ONE terminal tab. The tab may hold several coding agents working',
        tasks ? 'side by side. The operator reads it at a glance, often on a phone, so it must be short and easy to read.' : 'side by side; the recap covers all of them as one piece of work. The operator reads it at a',
        ...(tasks ? [] : ['glance, often on a phone, so it must be short and easy to read.']),
        '',
        ...inputRules(tasks),
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
        '- Keep an item of the <previous_recap> only while the <transcript> does not contradict it; finished work goes to "done".',
        '- "links" are names that resolve (!number, #number, a commit SHA, a branch name, a file path) or a full URL copied from the transcript, never descriptions.',
        '- Write every reference as the transcript does: the column turns !252, a SHA, `feat/x`, `src/a.ts` and URLs into clickable links.',
        '- Never invent facts that are not in the inputs.',
        '- When a section has nothing to say, use an empty list [] ("" for goal). Never write "none".',
    ].join('\n');
}
