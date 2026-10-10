import type { Judge } from '#src/ports/judge.ts';
import type { ImportedChapter } from '#src/ports/imported-recaps.ts';
import type { RunInputs } from '#src/ports/run-inputs.ts';
import type { Verdicts } from '#src/ports/verdicts.ts';
import { comparisonLines } from '#src/recap/render/compare.ts';
import { reportLines } from '#src/recap/render/eval.ts';
import type { Style } from '#src/recap/render/wrap.ts';
import { compareImported } from './compare-imported.ts';
import { reportOf } from './eval-report.ts';
import { judgeRuns } from './judge.ts';
import type { JudgeDeps } from './judge.ts';

export interface JudgedReplay {
    readonly judge: Judge;
    readonly store: { readonly inputs: RunInputs; readonly verdicts: Verdicts };
    readonly rubric: string;
    readonly label: string;
    readonly imported: readonly ImportedChapter[] | null;
    readonly beside: string | null;
    readonly style: Style;
    err(line: string): void;
}

export async function judgedReport(replayed: JudgedReplay): Promise<readonly string[]> {
    const runs = replayed.store.inputs.runs({ tab: replayed.label, since: null, limit: 100_000, withInput: true }).toReversed();
    const deps: JudgeDeps = { judge: replayed.judge, inputs: replayed.store.inputs, verdicts: replayed.store.verdicts, rubric: replayed.rubric, now: Date.now };
    let done = 0;
    const results = await judgeRuns(deps, runs, () => { done += 1; replayed.err(`judged ${done}/${runs.length}`); });
    const lines = [`the judge over the replay (${runs.length} runs):`, ...reportLines(reportOf(replayed.judge.label, results), replayed.style, 0)];
    if (replayed.imported === null || replayed.imported.length === 0) {
        return lines;
    }
    const compared = await compareImported({ ...deps, label: replayed.label }, replayed.imported);
    return [...lines, '', ...comparisonLines(compared, replayed.beside ?? '', replayed.style)];
}
