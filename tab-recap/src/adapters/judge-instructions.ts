// What the judge is told, per task. The rubric's item and section checks are quoted from the file, as the writer's instructions quote them.
import { RUBRIC } from './rubric.ts';
import type { JudgeTask } from '#src/ports/judge.ts';

/** The six fixed questions of the read-back, in the order they are graded as `readback-1` … `readback-6`. */
export const READBACK_QUESTIONS: readonly string[] = [
    'What is the goal?',
    'What has finished?',
    'What is waiting on the operator?',
    'What must not be done?',
    'Why was the most important decision taken?',
    'What is the next action?',
];

const SCORE = [
    'You judge a recap that an AI wrote for a terminal tab. Input: one <judge_input> document. <rubric> is the rubric,',
    '<writer_input> is everything the writer was given, <recap> holds the items it wrote (key = the name of an item).',
    '',
    'For EVERY item, answer every item check (I1 to I7) and the check of its own section (S-goal, S-now, … as in the rubric),',
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
    'For each key fact, say which item carries it, or null.',
    '',
    'Answer with ONLY one JSON object, no other text, no code fence:',
    '{"verdicts":[{"item":"<key>","check":"I1","pass":true,"critique":""}],"keyfacts":["..."],"coverage":[{"keyfact":0,"item":"<key>"}]}',
    '"keyfact" is the index in "keyfacts"; "item" is a key from <recap> or null. "critique" is empty when the check passes.',
].join('\n');

const READBACK = [
    'You are handed over a piece of work with nothing but a recap. Input: one <readback_input> document with the recap\'s items.',
    'Answer these six questions using ONLY the recap, one or two sentences each; when the recap does not say, answer "not stated".',
    '',
    ...READBACK_QUESTIONS.map((question, at) => `${at + 1}. ${question}`),
    '',
    'Answer with ONLY one JSON object, no other text, no code fence: {"answers":["...", "...", "...", "...", "...", "..."]} — six strings, in order.',
].join('\n');

const GRADE = [
    'You grade six answers that were written from a recap alone. Input: one <grading_input> document: <writer_input> is the truth',
    '(everything the work involved), <keyfacts> are its key facts, <answers> are the six answers.',
    '',
    'The questions were:',
    ...READBACK_QUESTIONS.map((question, at) => `${at + 1}. ${question}`),
    '',
    'An answer passes when it is correct and complete according to <writer_input>; "not stated" passes only when the input holds',
    'nothing to say (for example no rule was ever given). For question 5, the decision asked about is the most important one among <keyfacts>.',
    'A failure gets a one-line critique saying what is missing or wrong.',
    '',
    'Answer with ONLY one JSON object, no other text, no code fence: {"grades":[{"question":1,"pass":true,"critique":""}]} — one entry per question.',
].join('\n');

export const JUDGE_INSTRUCTIONS: Readonly<Record<JudgeTask, string>> = { score: SCORE, readback: READBACK, grade: GRADE };
