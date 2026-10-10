import { languageName } from '#src/i18n/index.ts';
import { SECTIONS } from '#src/i18n/sections.ts';
import type { SectionId } from '#src/i18n/sections.ts';
import { CAPS, MAX_WORDS } from '#src/recap/domain/shape.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';
import { WHY_WORDS } from '#src/recap/application/ops-answer.ts';
import { RECONCILE_LINES } from './reconcile-instructions.ts';
import { RUBRIC } from './rubric.ts';

function languageLines(language: string, previous: string): string[] {
    const own = language === 'en' ? [] : [
        language === 'es'
            ? 'Write every text and why in Spanish (neutral Latin American, informal "tú"). Keep the JSON keys and the words add, update, close in English.'
            : `Write every text and why in ${languageName(language)}. Keep the JSON keys and the words add, update, close in English.`,
    ];
    const carried = previous === language ? [] : [
        `The facts in <ledger> are in ${languageName(previous)}: update every open fact that is still relevant, rewritten in ${languageName(language)}.`,
    ];
    return [...own, ...carried, ...(own.length + carried.length > 0 ? [''] : [])];
}

const SHAPE = [
    '{"ops": [',
    '  {"op": "add", "section": "done", "text": "...", "why": null, "ref": null, "at": "HH:MM", "agent": "a1", "anchor": "..."},',
    '  {"op": "update", "id": "f12", "text": "...", "why": null},',
    '  {"op": "close", "id": "f3", "why": "done"}',
    ']}',
];

const groups = (request: Pick<RecapRequest, 'input'>): boolean => request.input.ledgers.length > 1;

const sectionLine = (section: { id: SectionId; hint: string }): string => {
    const size = section.id === 'goal' ? 'one line, one open at a time' : `the column shows the newest ${CAPS[section.id]}`;
    return `${section.id.padEnd(10)}— ${section.hint} (${size})`;
};

export function instructions(request: Pick<RecapRequest, 'language' | 'previousLanguage' | 'input' | 'retry'>): string {
    if (request.retry !== undefined) {
        return correctionInstructions(request);
    }
    const tasks = groups(request);
    return [
        'You keep a ledger of facts about ONE terminal tab. The tab may hold several coding agents working side by side.',
        'The operator reads the newest facts at a glance, often on a phone, so each must be short and easy to read.',
        '',
        'Input: <recap_input>. <ledger> lists the facts so far: each <fact> has an id (f1, f2, …), its section, its state (open, or closed',
        'with the reason), when it was first and last seen (HH:MM), its why, its reference and its anchor. What is NEW is in each <transcript>.',
        '<agent_note> = the agent\'s own summary: a hint, the transcript wins. Times are HH:MM: give each new fact the time it happened.',
        'Name agents by label.',
        '',
        ...(request.input.candidates === undefined ? [] : [...RECONCILE_LINES, '']),
        'Answer with ONLY one JSON object: no other text, no code fence. Operations on the ledger:',
        ...SHAPE,
        '- add what is new. "at" is the time of the turn it came from, as written in the transcript; "agent" the agent\'s id, when it is one agent\'s work.',
        '- every add has an "anchor": at most 120 characters copied word for word from a turn, a tool call or an agent note of this input that the fact comes from. Copy, never paraphrase: an add whose anchor is not in the input is refused.',
        '- update what changed: the same fact, now worded differently, with a new why, or in another state of progress.',
        '- close what finished ("done"), turned out wrong ("wrong"), was replaced ("superseded") or was answered ("answered"; only a question waiting on the operator, a "needs" fact).',
        '- an update may carry an "anchor" too, the quote that shows the change. A close never does.',
        '- never add a fact that is in the ledger: update it. A fact closed less than two hours ago is not added again either.',
        '- a decision always has a "why": the reason, in your own words. On an add or an update of anything else "why" is null. On a close it is the reason code.',
        '- a "now" fact you do not carry forward (update it, or add its next state) is closed for you: now is only what is under way at this moment.',
        '- when nothing changed, answer {"ops": []}.',
        ...(tasks ? ['- the ledger has one <ledger task="…"> per task: give an add the "task" it belongs to ("task": "t2"); an update or close goes to the fact\'s own task.'] : []),
        '',
        ...SECTIONS.map(sectionLine),
        `rules      — standing constraints the operator stated and still wants kept, never drawn (the column shows the newest ${CAPS.rules})`,
        '',
        ...languageLines(request.language, request.previousLanguage),
        'How to write:',
        `- Plain everyday words. Short sentences in the present tense, ${MAX_WORDS} words or fewer per text, ${WHY_WORDS} per why.`,
        '- Name real things: file names, branch names, merge request numbers, commands, error messages.',
        '- No filler, no hedging, no jargon. One fact per line, never the same fact twice.',
        '- "links" are names that resolve (!number, #number, a commit SHA, a branch name, a file path) or a full URL copied from the transcript, never descriptions.',
        '- Write every reference as the transcript does: the column turns !252, a SHA, `feat/x`, `src/a.ts` and URLs into clickable links.',
        '- Never invent facts that are not in the inputs.',
        '',
        'Every fact you add or update must pass these checks, each with a pass and a fail example:',
        RUBRIC.items,
        '',
        'Each section has a check of its own:',
        RUBRIC.sections,
        '',
        'An operation that fails a rule is sent back once, alone, in a <correction_input>: the operation and why. Fix each one so it',
        'passes, or leave it out of your answer. Never send the same operation again.',
    ].join('\n');
}

function correctionInstructions(request: Pick<RecapRequest, 'language' | 'previousLanguage' | 'input' | 'retry'>): string {
    return [
        'Some operations you answered on the ledger of a terminal tab were refused by rules checked in code. Input: one <correction_input>.',
        'Each <refused> holds the operation as you gave it and, for every rule that refused it, the rule\'s id and why. <ledger> shows the facts the operations name',
        '(an id is that fact\'s id in your first document). Nothing else is repeated: the rest of your answer was accepted.',
        '',
        'Answer with ONLY one JSON object: no other text, no code fence. Replacements for the refused operations only:',
        ...SHAPE,
        ...(request.retry?.tasks === true ? ['- an add names its task ("task": "t2"), as <refused task="…"> says.'] : []),
        '- send one operation for each refused one you still want, fixed so that it passes its rules; leave out those you do not want.',
        '- never send an operation that is not refused here, and never send the same operation again.',
        '- an add needs an "anchor": a quote of at most 120 characters copied word for word from the turns, tool calls or notes of your first document (use the one in <refused> when it is fine).',
        '- a decision always has a "why". "answered" closes only a question waiting on the operator; close anything else as done, wrong or superseded.',
        '- when a fact the refusal names is already in the ledger, update it instead of adding it again.',
        '- when none is worth keeping, answer {"ops": []}.',
        '',
        ...languageLines(request.language, request.previousLanguage),
        `Plain everyday words, ${MAX_WORDS} words or fewer per text, ${WHY_WORDS} per why. Never invent facts.`,
    ].join('\n');
}
