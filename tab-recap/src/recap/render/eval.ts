// What `tab-recap eval` prints. Pure: lines of text, styled by the Style the composition root chose (plain when the terminal wants none).
import { AGREEMENT_TARGET } from '#src/recap/application/eval-stats.ts';
import type { Agreement, GateReport } from '#src/recap/application/eval-stats.ts';
import { percent } from '#src/recap/application/eval-report.ts';
import type { EvalReport, RunLine } from '#src/recap/application/eval-report.ts';
import type { Candidate } from '#src/recap/application/eval-label.ts';
import type { Style } from './wrap.ts';

const NAMES: Readonly<Record<string, string>> = {
    I1: 'atomic', I2: 'stands alone', I3: 'specific', I4: 'supported', I5: 'about the work', I6: 'new', I7: 'still true',
    coverage: 'key facts carried', filler: 'items tied to a key fact',
};

function nameOf(check: string): string {
    if (check.startsWith('readback-')) {
        return `read-back question ${check.slice(9)}`;
    }
    return NAMES[check] ?? (check.startsWith('S-') ? `${check.slice(2)} section` : '');
}

const when = (at: number): string => new Date(at).toISOString().slice(0, 16).replace('T', ' ');
const short = (id: string): string => `${id.slice(0, 4)}…${id.slice(-6)}`;
const row = (cells: readonly string[], widths: readonly number[]): string => cells.map((cell, at) => cell.padEnd(widths[at] ?? 0)).join('  ').trimEnd();

const share = (label: string, part: { readonly passed: number; readonly total: number }): string => `${label} ${part.total === 0 ? 'n/a' : `${percent(part.passed, part.total)}% (${part.passed}/${part.total})`}`;

function runLine(line: RunLine, style: Style): string {
    const head = `${short(line.run.id)}  ${line.run.tab}  ${when(line.run.at)}`;
    if (line.kind === 'not-judged') {
        return `${head}  ${style.red('not judged')}: ${line.why}`;
    }
    const back = line.readback === null ? 'read-back n/a' : `read-back ${line.readback.filter((grade) => grade.pass).length}/6`;
    return `${head}  ${share('coverage', line.coverage)} · ${share('no-filler', line.filler)} · ${back}${line.note === null ? '' : style.yellow(` — ${line.note}`)}`;
}

/** The report of a sample: pass rates, failing items with their critique, then each run's coverage, no-filler and read-back. */
export function reportLines(report: EvalReport, style: Style, missing: number): readonly string[] {
    const judged = report.runs.filter((line) => line.kind === 'judged').length;
    const table = report.rates.map((rate) => [rate.check, nameOf(rate.check), `${percent(rate.passed, rate.total)}%`, `${rate.passed}/${rate.total}`]);
    const widths = [0, 1, 2, 3].map((column) => Math.max(...table.map((cells) => (cells[column] ?? '').length)));
    return [
        style.bold(`tab-recap eval — judge ${report.judge} — ${report.runs.length} runs sampled, ${judged} judged`),
        ...(missing > 0 ? [style.dim(`${missing} run${missing === 1 ? '' : 's'} in the period no longer have a stored input and are not judged`)] : []),
        '',
        style.bold('pass rate by check'),
        ...table.map((cells) => row(cells, widths)),
        '',
        style.bold(`failing items (${report.failures.length})`),
        ...(report.failures.length === 0 ? ['none'] : report.failures.map((fail) => `${style.red(fail.check)}  ${fail.key}  "${fail.text}" — ${fail.critique}`)),
        '',
        style.bold('runs'),
        ...report.runs.map((line) => runLine(line, style)),
        ...(report.costUsd > 0 ? ['', style.dim(`judge cost $${report.costUsd.toFixed(4)}`)] : []),
    ];
}

/** Per check: how often the judge and the operator agree, and in which direction they differ. */
export function agreeLines(rows: readonly Agreement[], style: Style): readonly string[] {
    if (rows.length === 0) {
        return ['no item has both a judge and an operator verdict yet: run `tab-recap eval --label <n>` after `eval`'];
    }
    const table = rows.map((agreement) => [agreement.check, `${agreement.percent}%`, `target ${AGREEMENT_TARGET}%`, `${agreement.agreed}/${agreement.items} agree`, `${agreement.falsePasses} false passes`, `${agreement.falseFails} false fails`]);
    const widths = [0, 1, 2, 3, 4, 5].map((column) => Math.max(...table.map((cells) => (cells[column] ?? '').length)));
    return [style.bold('judge against operator'), ...table.map((cells, at) => {
        const line = row(cells, widths);
        return (rows[at]?.percent ?? 0) >= AGREEMENT_TARGET ? style.green(line) : style.yellow(line);
    })];
}

/** The gates' counts over the runs that have them. */
export function gateLines(report: GateReport, style: Style): readonly string[] {
    const table = report.rows.map((gate) => [gate.gate, `${gate.refused} refused`, `${gate.flagged} flagged`]);
    const widths = [0, 1, 2].map((column) => Math.max(...table.map((cells) => (cells[column] ?? '').length)));
    return [
        style.bold(`gates over ${report.runs} run${report.runs === 1 ? '' : 's'}`),
        ...(table.length === 0 ? ['nothing refused or flagged'] : table.map((cells) => row(cells, widths))),
        `${report.dropped} item${report.dropped === 1 ? '' : 's'} dropped after the retry`,
    ];
}

/** An item to label: where it stands, then what it says. */
export const candidateLines = (candidate: Candidate, position: string, style: Style): readonly string[] => [
    '',
    style.dim(`${position}  ${candidate.run.tab}  ${when(candidate.run.at)}  ${candidate.key}`),
    style.bold(`"${candidate.text}"`),
];
