// The judge over a replay: the run each turn made is scored like any stored run (the same report as `eval --sample`), and the imported facts of
// a tab are scored beside it, against everything the replay's writer was shown.
import type { Judge } from '#src/ports/judge.ts';
import type { RunInputs, RunItem, StoredRun } from '#src/ports/run-inputs.ts';
import type { Verdicts } from '#src/ports/verdicts.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import { reportLines } from '#src/recap/render/eval.ts';
import type { Style } from '#src/recap/render/wrap.ts';
import { reportOf } from './eval-report.ts';
import { judgeRuns } from './judge.ts';
import type { JudgeDeps } from './judge.ts';

export interface JudgedReplay {
    readonly judge: Judge;
    /** the scratch store: the runs of the replay with their inputs */
    readonly store: { readonly inputs: RunInputs; readonly verdicts: Verdicts };
    readonly rubric: string;
    readonly label: string;
    /** the imported facts of a tab (null: none asked for, or none there) */
    readonly imported: readonly Fact[] | null;
    readonly beside: string | null;
    readonly style: Style;
    err(line: string): void;
}

const IMPORTED = 'imported';

/** The imported facts as one run to judge: they carry the keys `<task>/<section>/<n>`; the evidence is the replay's inputs, oldest first. */
function importedAsRuns(facts: readonly Fact[], evidence: string, label: string): { readonly run: StoredRun; readonly inputs: RunInputs } {
    const counted = new Map<string, number>();
    const items = facts.map((fact): RunItem => {
        const base = `${fact.task.key}/${fact.section}`;
        const at = counted.get(base) ?? 0;
        counted.set(base, at + 1);
        return { key: `${base}/${at}`, section: fact.section, text: fact.why === null ? fact.text : `${fact.text} — ${fact.why}` };
    });
    const run: StoredRun = { id: IMPORTED, tab: label, at: 0, language: 'en', backend: null, hasInput: true, gateStats: null };
    const inputs: RunInputs = { runs: () => [run], document: () => evidence, itemsOf: () => items, gateCounts: () => [], prune: () => 0 };
    return { run, inputs };
}

/** Verdicts about imported facts are shown, not kept: they belong to no run of the scratch store. */
const unkept: Verdicts = { add: () => undefined, ofRun: () => [], labelled: () => new Set(), pairs: () => [] };

export async function judgedReport(replayed: JudgedReplay): Promise<readonly string[]> {
    const runs = replayed.store.inputs.runs({ tab: replayed.label, since: null, limit: 100_000, withInput: true }).toReversed();
    const deps: JudgeDeps = { judge: replayed.judge, inputs: replayed.store.inputs, verdicts: replayed.store.verdicts, rubric: replayed.rubric, now: Date.now };
    let done = 0;
    const results = await judgeRuns(deps, runs, () => { done += 1; replayed.err(`judged ${done}/${runs.length}`); });
    const lines = [`the judge over the replay (${runs.length} runs):`, ...reportLines(reportOf(replayed.judge.label, results), replayed.style, 0)];
    if (replayed.imported === null || replayed.imported.length === 0) {
        return lines;
    }
    const evidence = runs.flatMap((run) => replayed.store.inputs.document(run.id) ?? []).join('\n');
    const { run, inputs } = importedAsRuns(replayed.imported, evidence, replayed.label);
    const beside = await judgeRuns({ ...deps, inputs, verdicts: unkept }, [run]);
    return [...lines, '', `the same judge over the facts imported for ${replayed.beside ?? ''} (${replayed.imported.length} facts):`, ...reportLines(reportOf(replayed.judge.label, beside), replayed.style, 0)];
}
