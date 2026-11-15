import { unfenced } from '../../tab-recap/src/adapters/job/prompts/recap-prompt.ts';
import { parseScore } from '../../tab-recap/src/recap/application/judge-answer.ts';
import { cohenKappa, wilson } from '../lib/stats.ts';
import type { Answer, Graded, Interval, Mark } from '../lib/types.ts';
import { carriersOf, CHECKS, pooled, sectionsOf, type CellMark, type JudgeItem } from './prompt.ts';

export const CODE_CRITERIA: readonly string[] = ['J1', 'J2', ...CHECKS.map((check) => `F_${check}`), ...CHECKS.map((check) => `P_${check}`)];

export interface Cell {
    readonly item: string;
    readonly section: string;
    readonly check: string;
    readonly pooled: string;
    readonly expected: CellMark;
}

export const cellKey = (item: string, check: string): string => `${item}|${check}`;

export function expectedCells(item: JudgeItem): Cell[] {
    return item.expected.items.flatMap((each) => Object.entries(each.checks).map(([check, expected]) => ({ item: each.key, section: each.section, check, pooled: pooled(check), expected })));
}

export function verdictsOf(item: JudgeItem, text: string): Map<string, boolean> | null {
    const parsed = parseScore(unfenced(text), sectionsOf(item), carriersOf(item));
    if (parsed.kind !== 'ok') return null;
    return new Map(parsed.value.verdicts.map((verdict) => [cellKey(verdict.item, verdict.check), verdict.pass]));
}

export function grade(item: JudgeItem, text: string): Graded {
    const cells = expectedCells(item);
    const of = (check: string, mark: CellMark): Cell[] => cells.filter((cell) => cell.pooled === check && cell.expected === mark);
    const marks: Record<string, Mark> = {};
    const verdicts = verdictsOf(item, text);
    if (verdicts === null) {
        marks['J1'] = false;
        marks['J2'] = false;
        for (const check of CHECKS) {
            marks[`F_${check}`] = of(check, 'fail').length === 0 ? null : false;
            marks[`P_${check}`] = of(check, 'pass').length === 0 ? null : false;
        }
        return { parsed: false, marks };
    }
    marks['J1'] = true;
    marks['J2'] = verdicts.size === cells.length && cells.every((cell) => verdicts.has(cellKey(cell.item, cell.check)));
    for (const check of CHECKS) {
        const fails = of(check, 'fail');
        const passes = of(check, 'pass');
        marks[`F_${check}`] = fails.length === 0 ? null : fails.every((cell) => verdicts.get(cellKey(cell.item, cell.check)) === false);
        marks[`P_${check}`] = passes.length === 0 ? null : passes.every((cell) => verdicts.get(cellKey(cell.item, cell.check)) === true);
    }
    return { parsed: true, marks };
}

export function stubAnswer(item: JudgeItem): string {
    return JSON.stringify({
        verdicts: item.expected.items.flatMap((each) => Object.entries(each.checks).map(([check, mark]) => ({ item: each.key, check, pass: mark !== 'fail', critique: mark === 'fail' ? each.why : '' }))),
        keyfacts: ['a key fact'],
        coverage: [{ keyfact: 0, item: item.input.state[0]?.key ?? null }],
    });
}

export interface Gate {
    readonly minFails: number;
    readonly minPasses: number;
    readonly kappa: number;
    readonly wilsonLowerBound: number;
}

export interface Flip {
    readonly config: string;
    readonly id: string;
    readonly item: string;
    readonly check: string;
    readonly verdicts: readonly string[];
}

export interface AgreementRow {
    readonly config: string;
    readonly check: string;
    readonly true_fail: Interval;
    readonly true_pass: Interval;
    readonly kappa: number | null;
    readonly missing: number;
    readonly flipping: number;
    readonly agrees: boolean;
}

export interface SectionRow {
    readonly config: string;
    readonly section: string;
    readonly fail_k: number;
    readonly fail_n: number;
    readonly pass_k: number;
    readonly pass_n: number;
}

export interface Agreement {
    readonly audit: string;
    readonly gate: Gate;
    readonly rows: readonly AgreementRow[];
    readonly sections: readonly SectionRow[];
    readonly saturated: readonly string[];
    readonly flips: readonly Flip[];
}

const shownMark = (mark: boolean | undefined): string => (mark === undefined ? '-' : mark ? 'pass' : 'fail');

function majority(marks: readonly (boolean | undefined)[]): boolean | null {
    const yes = marks.filter((mark) => mark === true).length;
    const no = marks.filter((mark) => mark === false).length;
    return yes > no ? true : no > yes ? false : null;
}

export function agreement(items: readonly JudgeItem[], answers: readonly Answer[], configs: readonly string[], repetitions: number, gate: Gate, audit: string): Agreement {
    const rows: AgreementRow[] = [];
    const sections: SectionRow[] = [];
    const flipsFound: Flip[] = [];
    for (const config of configs) {
        const judged: { cell: Cell; verdict: boolean | null }[] = [];
        for (const item of items) {
            const byRep = new Map<number, Map<string, boolean> | null>();
            for (const answer of answers) {
                if (answer.config !== config || answer.id !== item.id || answer.text === null) continue;
                byRep.set(answer.repetition, verdictsOf(item, answer.text));
            }
            for (const cell of expectedCells(item)) {
                if (cell.expected === 'open') continue;
                const marks = Array.from({ length: repetitions }, (_unused, index) => byRep.get(index + 1)?.get(cellKey(cell.item, cell.check)));
                if (marks.includes(true) && marks.includes(false)) flipsFound.push({ config, id: item.id, item: cell.item, check: cell.check, verdicts: marks.map(shownMark) });
                judged.push({ cell, verdict: majority(marks) });
            }
        }
        for (const check of CHECKS) {
            const mine = judged.filter((each) => each.cell.pooled === check);
            const known = mine.filter((each): each is { cell: Cell; verdict: boolean } => each.verdict !== null);
            const fails = known.filter((each) => each.cell.expected === 'fail');
            const passes = known.filter((each) => each.cell.expected === 'pass');
            const trueFail = wilson(fails.filter((each) => !each.verdict).length, fails.length);
            const truePass = wilson(passes.filter((each) => each.verdict).length, passes.length);
            const kappa = cohenKappa(known.map((each) => [each.cell.expected === 'pass', each.verdict] as const));
            const flipping = flipsFound.filter((flip) => flip.config === config && pooled(flip.check) === check).length;
            const agrees = fails.length >= gate.minFails && passes.length >= gate.minPasses && kappa !== null && kappa >= gate.kappa && trueFail.low >= gate.wilsonLowerBound && truePass.low >= gate.wilsonLowerBound;
            rows.push({ config, check, true_fail: trueFail, true_pass: truePass, kappa, missing: mine.length - known.length, flipping, agrees });
        }
        const sectionNames = [...new Set(judged.filter((each) => each.cell.pooled === 'S').map((each) => each.cell.section))].sort();
        for (const section of sectionNames) {
            const mine = judged.filter((each) => each.cell.pooled === 'S' && each.cell.section === section && each.verdict !== null);
            const fails = mine.filter((each) => each.cell.expected === 'fail');
            const passes = mine.filter((each) => each.cell.expected === 'pass');
            sections.push({ config, section, fail_k: fails.filter((each) => each.verdict === false).length, fail_n: fails.length, pass_k: passes.filter((each) => each.verdict === true).length, pass_n: passes.length });
        }
    }
    const mustFail = (check: string): number => items.flatMap(expectedCells).filter((cell) => cell.pooled === check && cell.expected === 'fail').length;
    const saturated = CHECKS.filter((check) => {
        const mine = rows.filter((row) => row.check === check);
        return mine.length > 0 && mine.every((row) => row.true_fail.n === mustFail(check) && row.true_fail.k === row.true_fail.n && row.true_fail.n > 0 && row.true_pass.n > 0 && row.true_pass.k / row.true_pass.n >= 0.98);
    });
    const order = (a: Flip, b: Flip): number => a.config.localeCompare(b.config) || a.id.localeCompare(b.id) || a.item.localeCompare(b.item) || a.check.localeCompare(b.check);
    return { audit, gate, rows, sections, saturated, flips: flipsFound.sort(order) };
}

const fixed = (value: number | null): string => (value === null ? '' : value.toFixed(4));

export function agreementCsv(found: Agreement): string {
    const head = ['config', 'check', 'must_fail_k', 'must_fail_n', 'true_fail_low', 'true_fail_high', 'must_pass_k', 'must_pass_n', 'true_pass_low', 'true_pass_high', 'kappa', 'missing_cells', 'flipping_cells', 'agrees', 'saturated'];
    const lines = found.rows.map((row) => [row.config, row.check, row.true_fail.k, row.true_fail.n, fixed(row.true_fail.low), fixed(row.true_fail.high), row.true_pass.k, row.true_pass.n, fixed(row.true_pass.low), fixed(row.true_pass.high), fixed(row.kappa), row.missing, row.flipping, row.agrees ? 1 : 0, found.saturated.includes(row.check) ? 1 : 0].join(','));
    return `${[head.join(','), ...lines].join('\n')}\n`;
}

const pct = (value: number): string => `${Math.round(value * 100)}%`;

const rate = (interval: Interval): string => (interval.n === 0 ? 'n/a' : `${interval.k}/${interval.n} (${pct(interval.low)}–${pct(interval.high)})`);

export function agreementMarkdown(found: Agreement): string {
    const lines: string[] = ['', '## judge-agreement: agreement with the planted labels (J3, J4)', '', `- ${found.audit}`, '- This is agreement with labels a model wrote, not with the owner. A cell every configuration gets wrong is first a suspect label.', '- No judge call is made in this eval: every criterion is graded by code against `expected.checks`.', `- A check "agrees with the planted labels" only with at least ${found.gate.minFails} must-fail and ${found.gate.minPasses} must-pass cells with a verdict, kappa at least ${found.gate.kappa}, and the Wilson 95 % lower bound of both rates at least ${found.gate.wilsonLowerBound}. Otherwise it is "not shown to agree".`, '- The verdict of a cell is the majority of its repetitions; a cell with no majority or no verdict is missing.', ''];
    lines.push('### Per configuration and check (J4)', '');
    lines.push('| Configuration | Check | True fail (Wilson 95 %) | True pass (Wilson 95 %) | Kappa | Missing | Flipping | Result |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const row of found.rows) lines.push(`| ${row.config} | ${row.check} | ${rate(row.true_fail)} | ${rate(row.true_pass)} | ${row.kappa === null ? 'n/a' : row.kappa.toFixed(3)} | ${row.missing} | ${row.flipping} | ${row.agrees ? 'agrees with the planted labels' : 'not shown to agree'} |`);
    lines.push('', '### Saturated checks', '');
    lines.push(found.saturated.length === 0 ? 'None.' : `${found.saturated.join(', ')}: every configuration found every planted breach and passed at least 98 % of the clean cells; this shows only that the planted breaches of these checks are easy.`);
    lines.push('', '### Section check by section (counts only; 2 or 3 planted fails per section show nothing by themselves)', '');
    lines.push('| Configuration | Section | Must-fail judged fail | Must-pass judged pass |');
    lines.push('|---|---|---|---|');
    for (const row of found.sections) lines.push(`| ${row.config} | ${row.section} | ${row.fail_k}/${row.fail_n} | ${row.pass_k}/${row.pass_n} |`);
    lines.push('', '### Cells whose verdict differs between repetitions (J3)', '');
    if (found.flips.length === 0) lines.push('None.');
    for (const flip of found.flips) lines.push(`- ${flip.config} ${flip.id} ${flip.item} ${flip.check}: ${flip.verdicts.join(', ')}`);
    lines.push('');
    return lines.join('\n');
}
