import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { instant, type Instant } from '@stateforge-labs/session-ledger';
import { percent } from '#src/recap/application/eval-report.ts';
import type { ChapterResult, Comparison, Side } from '#src/recap/application/compare-imported.ts';
import type { Share } from '#src/recap/application/judge-coverage.ts';
import type { Style } from '@stateforge-labs/recap-view/unstable/wrap.ts';

const EMPTY = must(parseText(''));

interface Tally {
    readonly passed: Count;
    readonly total: Count;
}

type ComparedChapter = ChapterResult & { kind: 'compared' };

const tally = (part: Share): Tally => ({ passed: must(parseCount(part.passed)), total: must(parseCount(part.total)) });
const when = (at: Instant): Text => must(parseText(new Date(at).toISOString().slice(0, 16).replace('T', ' ')));
const figure = (part: Tally): Text => must(parseText(part.total === 0 ? 'n/a' : `${percent(part.passed, part.total)}% (${part.passed}/${part.total})`));
const back = (side: Pick<Side, 'readback'>): Text => must(parseText(side.readback === null ? 'n/a' : `${side.readback.filter((grade) => grade.pass === 'pass').length}/6`));
const row = (cells: readonly Text[], widths: readonly Count[]): Text =>
    must(parseText(cells.map((cell, at) => (at === 0 ? cell.padEnd(widths[at] ?? 0) : cell.padStart(widths[at] ?? 0))).join('  ').trimEnd()));

function chapterCells(result: ComparedChapter): readonly Text[] {
    return [
        must(parseText(`chapter ${result.n} (${when(instant(result.at))}, ${result.keyfacts} key facts)`)),
        figure(tally(result.imported.coverage)), figure(tally(result.replay.coverage)), figure(tally(result.imported.filler)), figure(tally(result.replay.filler)),
        back(result.imported), back(result.replay),
    ];
}

export function comparisonText(comparison: Comparison, beside: Text, style: Style): readonly Text[] {
    const compared = comparison.chapters.flatMap((result) => (result.kind === 'compared' ? [result] : []));
    const skipped = comparison.chapters.flatMap((result) => (result.kind === 'skipped' ? [result] : []));
    const { imported, replay } = comparison.total;
    const sums = [
        must(parseText('all chapters')), figure(tally(imported.coverage)), figure(tally(replay.coverage)), figure(tally(imported.filler)), figure(tally(replay.filler)),
        must(parseText(`${imported.readback.passed}/${imported.readback.total}`)), must(parseText(`${replay.readback.passed}/${replay.readback.total}`)),
    ];
    const heads = ['', 'coverage 1.x', 'coverage 2.x', 'no-filler 1.x', 'no-filler 2.x', 'read-back 1.x', 'read-back 2.x'].map((head) => must(parseText(head)));
    const table = [heads, ...compared.map(chapterCells), ...(compared.length > 1 ? [sums] : [])];
    const widths = [0, 1, 2, 3, 4, 5, 6].map((column) => must(parseCount(Math.max(0, ...table.map((cells) => (cells[column] ?? EMPTY).length)))));
    return [
        must(parseText(style.bold(`the last good 1.x recap of each chapter of ${beside} against the replay's ledger state at the same time (same key facts, same read-back questions, same evidence)`))),
        ...(compared.length === 0 ? [must(parseText('no chapter could be compared'))] : table.map((cells) => row(cells, widths))),
        ...skipped.map((result) => must(parseText(style.dim(`chapter ${result.n} (${when(instant(result.at))}): ${result.why}`)))),
        ...(comparison.costUsd > 0 ? [must(parseText(style.dim(`comparison cost $${comparison.costUsd.toFixed(4)}`)))] : []),
    ];
}
