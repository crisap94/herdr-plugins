import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { KAPPA_BAR, trusted } from '#src/recap/application/eval-stats.ts';
import type { Agreement, GateReport } from '#src/recap/application/eval-stats.ts';
import { percent } from '#src/recap/application/eval-report.ts';
import type { EvalReport, RunLine, Totals } from '#src/recap/application/eval-report.ts';
import type { Candidate } from '#src/recap/application/eval-label.ts';
import type { Share } from '#src/recap/application/judge-coverage.ts';
import type { Style } from '@stateforge-labs/recap-view/unstable/wrap.ts';
export { candidateLines, reportLines } from './legacy.ts';

const NAMES: Readonly<Record<string, string>> = {
    I1: 'atomic', I2: 'stands alone', I3: 'specific', I4: 'supported', I5: 'about the work', I6: 'new', I7: 'still true',
    coverage: 'key facts carried', filler: 'items tied to a key fact',
};

const EMPTY = must(parseText(''));

function nameOf(check: Text): Text {
    if (check.startsWith('readback-')) {
        return must(parseText(`read-back question ${check.slice(9)}`));
    }
    return must(parseText(NAMES[check] ?? (check.startsWith('S-') ? `${check.slice(2)} section` : '')));
}

interface Tally {
    readonly passed: Count;
    readonly total: Count;
}

const tally = (part: Share): Tally => ({ passed: must(parseCount(part.passed)), total: must(parseCount(part.total)) });
const when = (at: Instant): Text => must(parseText(new Date(at).toISOString().slice(0, 16).replace('T', ' ')));
const short = (id: Text): Text => must(parseText(`${id.slice(0, 4)}…${id.slice(-6)}`));
const row = (cells: readonly Text[], widths: readonly Count[]): Text => must(parseText(cells.map((cell, at) => cell.padEnd(widths[at] ?? 0)).join('  ').trimEnd()));
const widthsOf = (table: readonly (readonly Text[])[], columns: Count): readonly Count[] =>
    [...Array(columns).keys()].map((column) => must(parseCount(Math.max(0, ...table.map((cells) => (cells[column] ?? EMPTY).length)))));

const figure = (part: Tally): Text => must(parseText(part.total === 0 ? 'n/a' : `${percent(part.passed, part.total)}% (${part.passed}/${part.total})`));
const share = (label: Text, part: Tally, added: Tally): Text => must(parseText(`${label} ${figure(part)} [added ${figure(added)}]`));

function runLine(line: RunLine, style: Style): Text {
    const head = `${short(must(parseText(line.run.id)))}  ${line.run.tab}  ${when(instant(line.run.at))}`;
    if (line.kind === 'not-judged') {
        return must(parseText(`${head}  ${style.red('not judged')}: ${line.why}`));
    }
    const back = line.readback === null ? 'read-back n/a' : `read-back ${line.readback.filter((grade) => grade.pass).length}/6`;
    const note = line.note === null ? '' : style.yellow(` — ${line.note}`);
    return must(parseText(`${head}  ${share(must(parseText('coverage')), tally(line.coverage), tally(line.added.coverage))} · ${share(must(parseText('no-filler')), tally(line.filler), tally(line.added.filler))} · ${back}${note}`));
}

function totalsLines(totals: Totals, style: Style): readonly Text[] {
    return [
        must(parseText(style.bold('all judged runs (state after each run; the facts each run added in brackets)'))),
        must(parseText(`coverage ${figure(tally(totals.coverage))} [added ${figure(tally(totals.added.coverage))}]`)),
        must(parseText(`no-filler ${figure(tally(totals.filler))} [added ${figure(tally(totals.added.filler))}]`)),
        must(parseText(`read-back median ${totals.readback === null ? 'n/a' : `${totals.readback}/6`}`)),
    ];
}

export function reportText(report: EvalReport, style: Style, missing: Count): readonly Text[] {
    const judged = report.runs.filter((line) => line.kind === 'judged').length;
    const table = report.rates.map((rate) => {
        const check = must(parseText(rate.check));
        return [check, nameOf(check), must(parseText(`${percent(rate.passed, rate.total)}%`)), must(parseText(`${rate.passed}/${rate.total}`))];
    });
    const widths = widthsOf(table, must(parseCount(4)));
    return [
        must(parseText(style.bold(`tab-recap eval — judge ${report.judge} — ${report.runs.length} runs sampled, ${judged} judged`))),
        ...(missing > 0 ? [must(parseText(style.dim(`${missing} run${missing === 1 ? '' : 's'} in the period no longer have a stored input and are not judged`)))] : []),
        EMPTY,
        must(parseText(style.bold('pass rate by check'))),
        ...table.map((cells) => row(cells, widths)),
        EMPTY,
        must(parseText(style.bold(`failing items (${report.failures.length})`))),
        ...(report.failures.length === 0 ? [must(parseText('none'))] : report.failures.map((fail) => must(parseText(`${style.red(fail.check)}  ${fail.key}  "${fail.text}" — ${fail.critique}`)))),
        EMPTY,
        must(parseText(style.bold(`judge vs anchor (${report.judgeVsAnchor.length}): the fact quotes its input and the judge calls it unsupported`))),
        ...(report.judgeVsAnchor.length === 0 ? [must(parseText('none'))] : report.judgeVsAnchor.map((fail) => must(parseText(`${style.red(fail.check)}  ${fail.key}  "${fail.text}" — ${fail.critique}`)))),
        EMPTY,
        ...totalsLines(report.totals, style),
        EMPTY,
        must(parseText(style.bold('runs'))),
        ...report.runs.map((line) => runLine(line, style)),
        ...(report.costUsd > 0 ? [EMPTY, must(parseText(style.dim(`judge cost $${report.costUsd.toFixed(4)}`)))] : []),
    ];
}

const kappaText = (agreement: Agreement): Text => must(parseText(agreement.kappa === null ? 'kappa n/a' : `kappa ${agreement.kappa.toFixed(2)}`));

export function agreeLines(rows: readonly Agreement[], style: Style): readonly Text[] {
    if (rows.length === 0) {
        return [must(parseText('no item has both a judge and an operator verdict yet: run `tab-recap eval --label <n>` after `eval`'))];
    }
    const table = rows.map((agreement) => [
        must(parseText(agreement.check)), must(parseText(`${agreement.percent}%`)), kappaText(agreement), must(parseText(`bar ${KAPPA_BAR}`)),
        must(parseText(`${agreement.agreed}/${agreement.items} agree`)), must(parseText(`${agreement.falsePasses} false passes`)), must(parseText(`${agreement.falseFails} false fails`)),
    ]);
    const widths = widthsOf(table, must(parseCount(7)));
    const lines = table.map((cells, at) => {
        const line = row(cells, widths);
        return must(parseText(trusted(rows[at] ?? { kappa: null }) ? style.green(line) : style.yellow(line)));
    });
    const worst = rows.flatMap((agreement) => (agreement.worst.length === 0 ? [] : [
        EMPTY, must(parseText(style.bold(`${agreement.check}: where they disagree (newest first)`))),
        ...agreement.worst.map((one) => must(parseText(`  "${one.text}" — judge ${one.judge ? 'pass' : 'fail'}${one.judgeCritique === null ? '' : ` (${one.judgeCritique})`}, operator ${one.operator ? 'pass' : 'fail'}${one.reason === null ? '' : ` (${one.reason})`}`))),
    ]));
    return [must(parseText(style.bold("judge against operator (Cohen's kappa; a check under the bar is yellow)"))), ...lines, ...worst];
}

export function gateLines(report: GateReport, style: Style): readonly Text[] {
    const table = report.rows.map((gate) => [must(parseText(gate.gate)), must(parseText(`${gate.refused} refused`)), must(parseText(`${gate.flagged} flagged`))]);
    const widths = widthsOf(table, must(parseCount(3)));
    return [
        must(parseText(style.bold(`gates over ${report.runs} run${report.runs === 1 ? '' : 's'}`))),
        ...(table.length === 0 ? [must(parseText('nothing refused or flagged'))] : table.map((cells) => row(cells, widths))),
        must(parseText(`${report.dropped} item${report.dropped === 1 ? '' : 's'} dropped after the retry`)),
    ];
}

export function candidateText(candidate: Candidate, position: Text, style: Style): readonly Text[] {
    return [
        EMPTY,
        must(parseText(style.dim(`${position}  ${candidate.run.tab}  ${when(instant(candidate.run.at))}  ${candidate.key}`))),
        must(parseText(style.bold(`"${candidate.text}"`))),
    ];
}
