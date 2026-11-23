import type { JudgePort } from '#src/ports/judge.ts';
import type { ImportedChapterRecord } from '#src/ports/imported-recaps.ts';
import type { RunInputReader } from '#src/ports/run-inputs.ts';
import type { VerdictStore } from '#src/ports/verdicts.ts';
import { must } from '#src/protocol/result.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { instant } from '#src/recap/domain/time.ts';
import { parseTabId, uncheckedTabId } from '#src/recap/domain/ids.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { comparisonText } from '#src/recap/render/compare.ts';
import { reportText } from '#src/recap/render/eval.ts';
import type { Style } from '#src/recap/render/wrap.ts';
import { compareImported } from './compare-imported.ts';
import { reportOf } from './eval-report.ts';
import { judgeRuns } from './judge.ts';
import type { JudgeDeps } from './judge.ts';

interface JudgeStore {
    readonly inputs: RunInputReader;
    readonly verdicts: VerdictStore;
}

export interface JudgedReplay {
    readonly judge: JudgePort;
    readonly store: JudgeStore;
    readonly rubric: Text;
    readonly label: Text;
    readonly imported: readonly ImportedChapterRecord[] | null;
    readonly beside: Text | null;
    readonly style: Style;
    err(line: Text): void;
}

export async function judgedReport(replayed: JudgedReplay): Promise<readonly Text[]> {
    const runs = replayed.store.inputs.runs({ tab: uncheckedTabId(replayed.label), since: null, limit: countOf(100_000), input: 'with-input' }).toReversed();
    const deps: JudgeDeps = { judge: replayed.judge, inputs: replayed.store.inputs, verdicts: replayed.store.verdicts, rubric: must(parseText(replayed.rubric)), now: () => instant(Date.now()) };
    let done = 0;
    const results = await judgeRuns(deps, runs, () => { done += 1; replayed.err(textOf(`judged ${done}/${runs.length}`)); });
    const lines = [textOf(`the judge over the replay (${runs.length} runs):`), ...reportText(reportOf(replayed.judge.label, results), replayed.style, countOf(0))];
    if (replayed.imported === null || replayed.imported.length === 0) {
        return lines;
    }
    const compared = await compareImported({ ...deps, label: must(parseTabId(replayed.label)) }, replayed.imported);
    return [...lines, textOf(''), ...comparisonText(compared, textOf(replayed.beside ?? ''), replayed.style)];
}
