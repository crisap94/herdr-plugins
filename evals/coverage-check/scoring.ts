import { createHash } from 'node:crypto';
import { probabilitiesOf } from '../../tab-recap/src/adapters/job/decider.ts';
import { KEPT_AT_LEAST, missingOf } from '../../tab-recap/src/recap/application/brief-coverage.ts';
import type { Config, Graded, Mark } from '../lib/types.ts';
import { factsFor, idsFor } from './prompt.ts';
import type { CoverageItem, ExpectedQuestion } from './prompt.ts';

export const PASS_MARK = KEPT_AT_LEAST;

export interface QuestionClass {
    readonly id: string;
    readonly label: string;
    readonly holds: (question: string, expected: ExpectedQuestion) => boolean;
}

const keeps = (question: string): boolean => question.startsWith('keeps_');
const reason = (question: string): boolean => question.startsWith('reason_');

export const CLASSES: readonly QuestionClass[] = [
    { id: 'C2', label: 'literal fact kept', holds: (question, expected) => keeps(question) && expected.how === 'literal' },
    { id: 'C3', label: 'foreign fact not kept', holds: (question, expected) => keeps(question) && expected.how === 'foreign' },
    { id: 'C4', label: 'kept facts found', holds: (question, expected) => keeps(question) && expected.kept },
    { id: 'C4p', label: 'reworded facts found', holds: (question, expected) => keeps(question) && expected.how === 'paraphrase' },
    { id: 'C5', label: 'dropped facts caught', holds: (question, expected) => keeps(question) && !expected.kept },
    { id: 'C5a', label: 'plainly absent facts caught', holds: (question, expected) => keeps(question) && expected.how === 'absent' },
    { id: 'C5n', label: 'near misses caught', holds: (question, expected) => keeps(question) && (expected.how === 'vague' || expected.how === 'detail-changed') },
    { id: 'C6', label: 'reasons', holds: (question) => reason(question) },
    { id: 'C6d', label: 'dropped reasons caught', holds: (question, expected) => reason(question) && expected.how === 'reason-dropped' },
];

export const CODE_CRITERIA: readonly string[] = ['C1', 'C2', 'C3', 'C4', 'C4p', 'C5', 'C5a', 'C5n', 'C6', 'C6d', 'C8', 'C8a', 'C8b'];

export const rightAt = (probability: number, kept: boolean, mark: number): boolean => (probability >= mark) === kept;

export function expectedOf(item: CoverageItem, question: string): ExpectedQuestion {
    const expected = item.expected.questions[question];
    if (expected === undefined) throw new Error(`${item.id}: no expected answer for ${question}`);
    return expected;
}

export function answersOf(item: CoverageItem, text: string): Record<string, number> | null {
    return probabilitiesOf(text, idsFor(item));
}

export function verdictRight(item: CoverageItem, answers: Readonly<Record<string, number>>, mark: number): boolean {
    return (missingOf(answers, factsFor(item), mark).length === 0) === item.expected.ok;
}

function applies(item: CoverageItem): Record<string, boolean> {
    const ids = idsFor(item);
    const found: Record<string, boolean> = { C1: true, C8: true, C8a: !item.expected.ok, C8b: item.expected.ok };
    for (const each of CLASSES) found[each.id] = ids.some((question) => each.holds(question, expectedOf(item, question)));
    return found;
}

export function grade(item: CoverageItem, text: string): Graded {
    const ids = idsFor(item);
    const expectedIds = Object.keys(item.expected.questions);
    if (ids.join() !== expectedIds.join()) throw new Error(`${item.id}: questionsFor gives ${ids.join()} but the dataset expects ${expectedIds.join()}`);
    const applicable = applies(item);
    const answers = answersOf(item, text);
    const marks: Record<string, Mark> = {};
    if (answers === null) {
        for (const criterion of CODE_CRITERIA) marks[criterion] = applicable[criterion] === true ? false : null;
        return { parsed: false, marks };
    }
    marks.C1 = true;
    for (const each of CLASSES) {
        const asked = ids.filter((question) => each.holds(question, expectedOf(item, question)));
        marks[each.id] = asked.length === 0 ? null : asked.every((question) => rightAt(answers[question] ?? -1, expectedOf(item, question).kept, PASS_MARK));
    }
    const verdict = verdictRight(item, answers, PASS_MARK);
    marks.C8 = verdict;
    marks.C8a = item.expected.ok ? null : verdict;
    marks.C8b = item.expected.ok ? verdict : null;
    return { parsed: true, marks };
}

const byte = (text: string): number => createHash('sha256').update(text).digest()[0] ?? 0;

export const STUB_KEPT = 0.9;
export const STUB_NOT_KEPT = 0.1;

export function stub(item: CoverageItem, config: Config, repetition: number): string {
    if (byte(`${config.name}|${item.id}|${repetition}|shape`) < 2) return 'I cannot tell from this brief.';
    const answers: Record<string, number> = {};
    for (const question of idsFor(item)) {
        const kept = expectedOf(item, question).kept;
        const flipped = byte(`${config.name}|${item.id}|${repetition}|${question}`) < 16;
        answers[question] = kept !== flipped ? STUB_KEPT : STUB_NOT_KEPT;
    }
    const json = JSON.stringify(answers);
    return config.backend === 'codex' ? `\`\`\`json\n${json}\n\`\`\`` : json;
}
