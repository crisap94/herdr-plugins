import { join } from 'node:path';
import { csvCell, writeJson, writeText } from '../lib/output.ts';
import { lastByKey, readJsonl } from '../lib/runner.ts';
import { shown, wilson } from '../lib/stats.ts';
import { AUDIT } from '../lib/summary.ts';
import type { Answer } from '../lib/types.ts';
import { idsFor } from './prompt.ts';
import type { CoverageItem } from './prompt.ts';
import { CLASSES, PASS_MARK, answersOf, expectedOf, rightAt, verdictRight } from './scoring.ts';

export interface QuestionRow {
    readonly id: string;
    readonly config: string;
    readonly repetition: number;
    readonly question: string;
    readonly how: string;
    readonly kept: boolean;
    readonly probability: number | null;
}

export const MARKS: readonly number[] = [0.6, 0.7, 0.75];
export const SWEEP: readonly number[] = Array.from({ length: 14 }, (_unused, index) => Math.round((0.3 + index * 0.05) * 100) / 100);
const LISTED = 60;

export function answersIn(dir: string, items: readonly CoverageItem[], configs: readonly string[], repetitions: number): Answer[] {
    const ids = new Set(items.map((item) => item.id));
    return [...lastByKey(readJsonl<Answer>(join(dir, 'answers.jsonl'))).values()].filter((answer) => ids.has(answer.id) && configs.includes(answer.config) && answer.repetition <= repetitions);
}

export function rowsOf(items: readonly CoverageItem[], answers: readonly Answer[]): QuestionRow[] {
    const byId = new Map(items.map((item) => [item.id, item]));
    const rows: QuestionRow[] = [];
    for (const answer of answers) {
        const item = byId.get(answer.id);
        if (item === undefined || answer.text === null) continue;
        const parsed = answersOf(item, answer.text);
        for (const question of idsFor(item)) {
            const expected = expectedOf(item, question);
            rows.push({ id: answer.id, config: answer.config, repetition: answer.repetition, question, how: expected.how, kept: expected.kept, probability: parsed === null ? null : (parsed[question] ?? null) });
        }
    }
    return rows.sort((a, b) => a.id.localeCompare(b.id) || a.config.localeCompare(b.config) || a.repetition - b.repetition || a.question.localeCompare(b.question, 'en', { numeric: true }));
}

const right = (row: QuestionRow, mark: number): boolean => row.probability !== null && rightAt(row.probability, row.kept, mark);

export function questionsCsv(rows: readonly QuestionRow[]): string {
    const header = ['id', 'config', 'repetition', 'question', 'how', 'expected_kept', 'probability', 'right'];
    const lines = rows.map((row) => [csvCell(row.id), csvCell(row.config), csvCell(row.repetition), csvCell(row.question), csvCell(row.how), row.kept ? '1' : '0', csvCell(row.probability), right(row, PASS_MARK) ? '1' : '0'].join(','));
    return `${[header.join(','), ...lines].join('\n')}\n`;
}

export function auc(rows: readonly QuestionRow[]): number | null {
    const scored = rows.filter((row): row is QuestionRow & { readonly probability: number } => row.probability !== null);
    const positives = scored.filter((row) => row.kept).map((row) => row.probability);
    const negatives = scored.filter((row) => !row.kept).map((row) => row.probability);
    if (positives.length === 0 || negatives.length === 0) return null;
    let wins = 0;
    for (const positive of positives) {
        for (const negative of negatives) wins += positive > negative ? 1 : positive === negative ? 0.5 : 0;
    }
    return wins / (positives.length * negatives.length);
}

function classRows(rows: readonly QuestionRow[], classId: string): QuestionRow[] {
    const each = CLASSES.find((candidate) => candidate.id === classId);
    if (each === undefined) throw new Error(`unknown class ${classId}`);
    return rows.filter((row) => each.holds(row.question, { kept: row.kept, how: row.how, fact: '' }));
}

const rate = (rows: readonly QuestionRow[], mark: number): string => shown(wilson(rows.filter((row) => right(row, mark)).length, rows.length));

const pct = (rows: readonly QuestionRow[], mark: number): string => (rows.length === 0 ? 'n/a' : `${Math.round((rows.filter((row) => right(row, mark)).length / rows.length) * 100)}%`);

function verdicts(items: readonly CoverageItem[], answers: readonly Answer[], config: string, mark: number, ok: boolean): string {
    let k = 0;
    let n = 0;
    for (const answer of answers) {
        if (answer.config !== config || answer.text === null) continue;
        const item = items.find((candidate) => candidate.id === answer.id);
        if (item === undefined || item.expected.ok !== ok) continue;
        const parsed = answersOf(item, answer.text);
        n += 1;
        if (parsed !== null && verdictRight(item, parsed, mark)) k += 1;
    }
    return shown(wilson(k, n));
}

export interface Flip {
    readonly config: string;
    readonly id: string;
    readonly question: string;
    readonly probabilities: readonly (number | null)[];
}

export function flipsOf(rows: readonly QuestionRow[]): Flip[] {
    const groups = new Map<string, QuestionRow[]>();
    for (const row of rows) {
        const key = `${row.config}|${row.id}|${row.question}`;
        groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const found: Flip[] = [];
    for (const group of groups.values()) {
        const sides = new Set(group.map((row) => (row.probability === null ? 'none' : row.probability >= PASS_MARK ? 'kept' : 'missing')));
        const first = group[0];
        if (first !== undefined && group.length > 1 && sides.size > 1) found.push({ config: first.config, id: first.id, question: first.question, probabilities: group.map((row) => row.probability) });
    }
    return found;
}

export function confidentWrong(rows: readonly QuestionRow[]): QuestionRow[] {
    return rows.filter((row) => row.probability !== null && ((row.kept && row.probability <= 0.1) || (!row.kept && row.probability >= 0.9)));
}

export function questionReport(items: readonly CoverageItem[], answers: readonly Answer[], configs: readonly string[]): { readonly markdown: string; readonly data: unknown } {
    const rows = rowsOf(items, answers);
    const lines: string[] = [];
    const data: Record<string, unknown> = {};
    lines.push('## Question level (coverage-check)', '');
    lines.push(`- ${AUDIT}`);
    lines.push('- Rates pooled over questions are optimistic: the questions cluster in 24 briefs and reuse 122 facts, so the Wilson intervals below are too narrow. Item-level marks above are the ones to compare.');
    lines.push('- An answer the parser refused counts as wrong on every one of its questions; a transport failure has no row.', '');
    lines.push(`### Rates at the plugin's mark ${PASS_MARK}`, '');
    lines.push(`| Configuration | ${CLASSES.map((each) => `${each.id} ${each.label}`).join(' | ')} |`, `|---|${CLASSES.map(() => '---').join('|')}|`);
    for (const config of configs) {
        const mine = rows.filter((row) => row.config === config);
        lines.push(`| ${config} | ${CLASSES.map((each) => rate(classRows(mine, each.id), PASS_MARK)).join(' | ')} |`);
    }
    lines.push('', '### At the three style marks', '');
    lines.push('C4 kept facts found, C5 dropped facts caught, C5n near misses caught, C6d dropped reasons caught; C8a a bad brief is not passed and C8b a good brief is not blocked, per answer.', '');
    lines.push('| Configuration | Mark | C4 | C5 | C5n | C6d | C8a | C8b |', '|---|---|---|---|---|---|---|---|');
    for (const config of configs) {
        const mine = rows.filter((row) => row.config === config);
        for (const mark of MARKS) {
            lines.push(`| ${config} | ${mark} | ${['C4', 'C5', 'C5n', 'C6d'].map((id) => rate(classRows(mine, id), mark)).join(' | ')} | ${verdicts(items, answers, config, mark, false)} | ${verdicts(items, answers, config, mark, true)} |`);
        }
    }
    lines.push('', '### Sweep of the mark', '');
    lines.push('Each cell: C4 kept facts found / C5 dropped facts caught, share of questions.', '');
    lines.push(`| Mark | ${configs.join(' | ')} |`, `|---|${configs.map(() => '---').join('|')}|`);
    const sweep: Record<string, Record<string, { readonly c4: string; readonly c5: string }>> = {};
    for (const mark of SWEEP) {
        const cells = configs.map((config) => {
            const mine = rows.filter((row) => row.config === config);
            const c4 = pct(classRows(mine, 'C4'), mark);
            const c5 = pct(classRows(mine, 'C5'), mark);
            sweep[String(mark)] = { ...(sweep[String(mark)] ?? {}), [config]: { c4, c5 } };
            return `${c4} / ${c5}`;
        });
        lines.push(`| ${mark.toFixed(2)} | ${cells.join(' | ')} |`);
    }
    data.sweep = sweep;
    lines.push('', '### AUC of the probability against the expected side', '');
    lines.push('| Configuration | AUC | Questions with a probability |', '|---|---|---|');
    const aucs: Record<string, number | null> = {};
    for (const config of configs) {
        const mine = rows.filter((row) => row.config === config);
        const value = auc(mine);
        aucs[config] = value;
        lines.push(`| ${config} | ${value === null ? 'n/a' : value.toFixed(3)} | ${mine.filter((row) => row.probability !== null).length} |`);
    }
    data.auc = aucs;
    const wrong = confidentWrong(rows);
    data.confident_wrong = wrong;
    lines.push('', '### Confident wrong answers', '');
    lines.push(`0.9 or more on a question expected not kept, or 0.1 or less on one expected kept: ${wrong.length} in all.`, '');
    lines.push('| Configuration | Count |', '|---|---|');
    for (const config of configs) lines.push(`| ${config} | ${wrong.filter((row) => row.config === config).length} |`);
    if (wrong.length > 0) {
        lines.push('', '| Configuration | Item | Repetition | Question | How | Expected | Probability |', '|---|---|---|---|---|---|---|');
        for (const row of wrong.slice(0, LISTED)) lines.push(`| ${row.config} | ${row.id} | ${row.repetition} | ${row.question} | ${row.how} | ${row.kept ? 'kept' : 'not kept'} | ${row.probability ?? ''} |`);
        if (wrong.length > LISTED) lines.push('', `${wrong.length - LISTED} more in questions.csv and question-summary.json.`);
    }
    const flipped = flipsOf(rows);
    data.c7_flips = flipped;
    lines.push('', '### C7: questions that change side between repetitions', '');
    lines.push('| Configuration | Questions that flip | Questions with every repetition |', '|---|---|---|');
    for (const config of configs) {
        const mine = rows.filter((row) => row.config === config);
        const complete = new Set(mine.map((row) => `${row.id}|${row.question}`)).size;
        lines.push(`| ${config} | ${flipped.filter((flip) => flip.config === config).length} | ${complete} |`);
    }
    if (flipped.length > 0) {
        lines.push('', '| Configuration | Item | Question | Probabilities by repetition |', '|---|---|---|---|');
        for (const flip of flipped.slice(0, LISTED)) lines.push(`| ${flip.config} | ${flip.id} | ${flip.question} | ${flip.probabilities.map((value) => (value === null ? 'unparsed' : String(value))).join(', ')} |`);
        if (flipped.length > LISTED) lines.push('', `${flipped.length - LISTED} more in question-summary.json.`);
    }
    lines.push('');
    return { markdown: lines.join('\n'), data };
}

export function writeQuestionOutputs(dir: string, items: readonly CoverageItem[], configs: readonly string[], repetitions: number): string {
    const answers = answersIn(dir, items, configs, repetitions);
    writeText(join(dir, 'questions.csv'), questionsCsv(rowsOf(items, answers)));
    const { markdown, data } = questionReport(items, answers, configs);
    writeJson(join(dir, 'question-summary.json'), data);
    return markdown;
}
