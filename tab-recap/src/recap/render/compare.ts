// What `eval --replay --compare-imported` prints: the last good 1.x recap of each chapter beside the replay's ledger state at the same time. Pure.
import { percent } from '#src/recap/application/eval-report.ts';
import type { ChapterResult, Comparison, Side } from '#src/recap/application/compare-imported.ts';
import type { Style } from './wrap.ts';

const when = (at: number): string => new Date(at).toISOString().slice(0, 16).replace('T', ' ');
const figure = (part: { readonly passed: number; readonly total: number }): string => (part.total === 0 ? 'n/a' : `${percent(part.passed, part.total)}% (${part.passed}/${part.total})`);
const back = (side: Pick<Side, 'readback'>): string => (side.readback === null ? 'n/a' : `${side.readback.filter((grade) => grade.pass).length}/6`);
const row = (cells: readonly string[], widths: readonly number[]): string => cells.map((cell, at) => (at === 0 ? cell.padEnd(widths[at] ?? 0) : cell.padStart(widths[at] ?? 0))).join('  ').trimEnd();

function chapterCells(result: ChapterResult & { kind: 'compared' }): readonly string[] {
    return [`chapter ${result.n} (${when(result.at)}, ${result.keyfacts} key facts)`, figure(result.imported.coverage), figure(result.replay.coverage), figure(result.imported.filler), figure(result.replay.filler), back(result.imported), back(result.replay)];
}

/** One line per chapter, then the sums; chapters the replay does not reach, or that could not be judged, say why below. */
export function comparisonLines(comparison: Comparison, beside: string, style: Style): readonly string[] {
    const compared = comparison.chapters.flatMap((result) => (result.kind === 'compared' ? [result] : []));
    const skipped = comparison.chapters.flatMap((result) => (result.kind === 'skipped' ? [result] : []));
    const { imported, replay } = comparison.total;
    const sums = ['all chapters', figure(imported.coverage), figure(replay.coverage), figure(imported.filler), figure(replay.filler), `${imported.readback.passed}/${imported.readback.total}`, `${replay.readback.passed}/${replay.readback.total}`];
    const table = [
        ['', 'coverage 1.x', 'coverage 2.x', 'no-filler 1.x', 'no-filler 2.x', 'read-back 1.x', 'read-back 2.x'],
        ...compared.map(chapterCells), ...(compared.length > 1 ? [sums] : []),
    ];
    const widths = [0, 1, 2, 3, 4, 5, 6].map((column) => Math.max(...table.map((cells) => (cells[column] ?? '').length)));
    return [
        style.bold(`the last good 1.x recap of each chapter of ${beside} against the replay's ledger state at the same time (same key facts, same read-back questions, same evidence)`),
        ...(compared.length === 0 ? ['no chapter could be compared'] : table.map((cells) => row(cells, widths))),
        ...skipped.map((result) => style.dim(`chapter ${result.n} (${when(result.at)}): ${result.why}`)),
        ...(comparison.costUsd > 0 ? [style.dim(`comparison cost $${comparison.costUsd.toFixed(4)}`)] : []),
    ];
}
