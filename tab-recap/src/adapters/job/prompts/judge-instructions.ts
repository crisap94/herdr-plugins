import { READBACK as QUESTIONS } from '#src/recap/domain/questions.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { RUBRIC } from './rubric-text.ts';
import type { AnchorCheck, AnchorChecks, JudgeTask } from '#src/ports/judge.ts';
import { ANCHORS_PER_CHECK } from '#src/recap/application/judge-anchors.ts';

export { judgeInstructions } from './legacy.ts';

export const READBACK_TEXTS: readonly Text[] = QUESTIONS.map((question) => must(parseText(question.text)));

export { READBACK_TEXTS as READBACK_QUESTIONS };

const SCORE = [
    'You judge a recap that an AI wrote for a terminal tab. Input: one <judge_input> document. <rubric> is the rubric,',
    '<writer_input> is everything the writer was given, <recap> holds the items it added in this run (key = the name of an item),',
    '<state> holds all the items that are open after the run, the ones added earlier too (key = state/…).',
    '',
    'For EVERY item of <recap>, answer every item check (I1 to I7) and the check of its own section (S-goal, S-now, … as in the rubric),',
    'yes or no, judged only on <writer_input>. Be strict and literal: pass only what the check says. Every failure gets a',
    'one-line critique, naming what is wrong in that item.',
    '',
    'Item checks:',
    RUBRIC.items,
    '',
    'Section checks:',
    RUBRIC.sections,
    '',
    'Then read <writer_input> alone and list its key facts: what a person who read only the recap would need to know about the work',
    '(the goal, results, decisions with their reasons, open questions, standing rules, next steps) — at most 15, one short line each.',
    'For each key fact, say which item of <state> carries it (a fact that was already open counts), or null.',
    '',
    'Answer with ONLY one JSON object, no other text, no code fence:',
    '{"verdicts":[{"item":"<key>","check":"I1","pass":true,"critique":""}],"keyfacts":["..."],"coverage":[{"keyfact":0,"item":"<state key>"}]}',
    '"keyfact" is the index in "keyfacts"; "item" is a key from <state> or null. "critique" is empty when the check passes.',
].join('\n');

const COVER = [
    'You compare a recap with the work it is about. Input: one <cover_input> document. <writer_input> is everything the work involved,',
    '<state> holds the recap\'s items (key = the name of an item), <keyfacts> (when present) the key facts to use.',
    '',
    'Without <keyfacts>, read <writer_input> alone and list its key facts: what a person who read only the recap would need to know about the work',
    '(the goal, results, decisions with their reasons, open questions, standing rules, next steps) — at most 15, one short line each.',
    'With <keyfacts>, use exactly those, in that order, and list no others.',
    'For each key fact, say which item of <state> carries it, or null.',
    '',
    'Answer with ONLY one JSON object, no other text, no code fence:',
    '{"keyfacts":["..."],"coverage":[{"keyfact":0,"item":"<key>"}]}',
    '"keyfact" is the index in the key facts; "item" is a key from <state> or null.',
].join('\n');

const READBACK = [
    'You are handed over a piece of work with nothing but a recap. Input: one <readback_input> document with the recap\'s items.',
    'Answer these six questions using ONLY the recap, one or two sentences each; when the recap does not say, answer "not stated".',
    '',
    ...READBACK_TEXTS.map((question, at) => `${at + 1}. ${question}`),
    '',
    'Answer with ONLY one JSON object, no other text, no code fence: {"answers":["...", "...", "...", "...", "...", "..."]} — six strings, in order.',
].join('\n');

const GRADE = [
    'You grade six answers that were written from a recap alone. Input: one <grading_input> document: <writer_input> is the truth',
    '(everything the work involved), <keyfacts> are its key facts, <answers> are the six answers.',
    '',
    'The questions were:',
    ...READBACK_TEXTS.map((question, at) => `${at + 1}. ${question}`),
    '',
    'An answer passes when it is correct and complete according to <writer_input>; "not stated" passes only when the input holds',
    'nothing to say (for example no rule was ever given). For question 5, the decision asked about is the most important one among <keyfacts>.',
    'A failure gets a one-line critique saying what is missing or wrong.',
    '',
    'Answer with ONLY one JSON object, no other text, no code fence: {"grades":[{"question":1,"pass":true,"critique":""}]} — one entry per question.',
].join('\n');

export const JUDGE_TEXT: Readonly<Record<JudgeTask, Text>> = {
    score: must(parseText(SCORE)),
    readback: must(parseText(READBACK)),
    grade: must(parseText(GRADE)),
    cover: must(parseText(COVER)),
};

export { JUDGE_TEXT as JUDGE_INSTRUCTIONS };

const anchorBlock = (check: Text, anchors: readonly AnchorCheck[]): Text =>
    must(parseText([`${check}:`, ...anchors.map((anchor) => `- "${anchor.item}" — the operator ruled ${anchor.verdict === 'pass' ? 'PASS' : 'FAIL'}${anchor.reason === '' ? '' : `: ${anchor.reason}`}`)].join('\n')));

const collate = new Intl.Collator('en', { numeric: true }).compare;

export function judgeInstructionsOf(task: JudgeTask, anchors: AnchorChecks = new Map()): Text {
    const given = [...anchors].filter(([, list]) => list.length > 0);
    if (task !== 'score' || given.length === 0) {
        return JUDGE_TEXT[task];
    }
    const checks = given.map(([check]) => check).toSorted(collate);
    const blocks = checks.map((check) => anchorBlock(check, (anchors.get(check) ?? []).slice(0, ANCHORS_PER_CHECK)));
    return must(parseText([JUDGE_TEXT[task], '', 'Where the operator overruled an earlier judge, they decided like this (newest first). When in doubt, decide the same way:', ...blocks].join('\n')));
}
