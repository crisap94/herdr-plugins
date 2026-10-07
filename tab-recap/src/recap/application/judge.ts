// Judging one stored run: score the facts it added against the rubric, find the key facts and what carries them in the ledger's state after it, read that state back, and keep the verdicts.
import type { Judge } from '#src/ports/judge.ts';
import type { RunInputs, RunItem, StoredRun } from '#src/ports/run-inputs.ts';
import type { Verdict, Verdicts } from '#src/ports/verdicts.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { gradingDocument, readbackDocument, scoringDocument } from './judge-context.ts';
import { parseAnswers, parseGrades, parseScore } from './judge-answer.ts';
import { measureState } from './judge-coverage.ts';
import type { Measured, Row, Share } from './judge-coverage.ts';
import type { Grade } from './judge-answer.ts';

export interface JudgeDeps {
    readonly judge: Judge;
    readonly inputs: RunInputs;
    readonly verdicts: Verdicts;
    /** the rubric file's text, as the judge's document carries it */
    readonly rubric: string;
    readonly now: () => number;
}

export type { Share } from './judge-coverage.ts';

export type RunResult =
    | {
        readonly kind: 'judged'; readonly run: StoredRun; readonly items: readonly RunItem[]; readonly verdicts: readonly Verdict[]; readonly coverage: Share; readonly filler: Share;
        /** the numbers over the facts the run added only */
        readonly added: Measured['added']; readonly stateSize: number; readonly readback: readonly Grade[] | null; readonly note: string | null; readonly costUsd: number;
    }
    | { readonly kind: 'not-judged'; readonly run: StoredRun; readonly why: string; readonly costUsd: number };

/** Two calls: the answers from the recap alone, then their grades against the input. Null (with why) when either cannot be used. */
export async function readBack(deps: JudgeDeps, parts: { readonly items: readonly RunItem[]; readonly input: string; readonly keyfacts: readonly string[] }): Promise<{ readonly grades: readonly Grade[] | null; readonly note: string | null; readonly costUsd: number }> {
    const asked = await deps.judge.ask('readback', readbackDocument(parts.items));
    if (isUnknown(asked)) {
        return { grades: null, note: `read-back: ${saying(asked.why)}`, costUsd: 0 };
    }
    const answers = parseAnswers(asked.text);
    if (answers.kind === 'unusable') {
        return { grades: null, note: `read-back: ${answers.why}`, costUsd: asked.costUsd };
    }
    const graded = await deps.judge.ask('grade', gradingDocument({ input: parts.input, keyfacts: parts.keyfacts, answers: answers.value }));
    if (isUnknown(graded)) {
        return { grades: null, note: `read-back grading: ${saying(graded.why)}`, costUsd: asked.costUsd };
    }
    const grades = parseGrades(graded.text);
    return { grades: grades.kind === 'ok' ? grades.value : null, note: grades.kind === 'ok' ? null : `read-back grading: ${grades.why}`, costUsd: asked.costUsd + graded.costUsd };
}

const critique = (line: string): string | null => (line === '' ? null : line);

const verdictOf = (deps: JudgeDeps, run: StoredRun, row: Row): Verdict => ({ run: run.id, item: row.item, check: row.check, pass: row.pass, critique: row.critique, judge: deps.judge.label, at: deps.now(), source: 'judge' });

const notJudged = (run: StoredRun, why: string, costUsd = 0): RunResult => ({ kind: 'not-judged', run, why, costUsd });

/** One run, judged and stored. A model that fails or answers nonsense makes the run `not-judged`; nothing is stored for it. Item checks are scored on the facts the run added; coverage, no-filler and the read-back on the ledger's state after it. */
export async function judgeRun(deps: JudgeDeps, run: StoredRun): Promise<RunResult> {
    const input = deps.inputs.document(run.id);
    const items = deps.inputs.itemsOf(run.id, 'added');
    const state = deps.inputs.itemsOf(run.id, 'state');
    if (input === null) {
        return notJudged(run, 'its input is no longer stored');
    }
    if (items.length === 0) {
        return notJudged(run, 'it wrote no items');
    }
    const asked = await deps.judge.ask('score', scoringDocument({ rubric: deps.rubric, input, items, state }));
    if (isUnknown(asked)) {
        return notJudged(run, saying(asked.why));
    }
    const scored = parseScore(asked.text, new Map(items.map((item) => [item.key, item.section])), new Map(state.map((item) => [item.key, item.section])));
    if (scored.kind === 'unusable') {
        return notJudged(run, scored.why, asked.costUsd);
    }
    const measured = measureState(state, scored.value);
    const back = await readBack(deps, { items: state, input, keyfacts: scored.value.keyfacts });
    const rows: readonly Row[] = [
        ...scored.value.verdicts.map((verdict): Row => ({ item: verdict.item, check: verdict.check, pass: verdict.pass, critique: critique(verdict.critique) })),
        ...measured.rows,
        ...(back.grades ?? []).map((grade): Row => ({ item: null, check: `readback-${grade.question}`, pass: grade.pass, critique: critique(grade.critique) })),
    ];
    const verdicts = rows.map((row): Verdict => verdictOf(deps, run, row));
    deps.verdicts.add(verdicts);
    return {
        kind: 'judged', run, items, verdicts, coverage: measured.coverage, filler: measured.filler, added: measured.added, stateSize: state.length,
        readback: back.grades, note: back.note, costUsd: asked.costUsd + back.costUsd,
    };
}

/** The runs in turn (one model call at a time), each result handed to `each` as it is known. */
export async function judgeRuns(deps: JudgeDeps, runs: readonly StoredRun[], each: (result: RunResult) => void = (): void => undefined): Promise<readonly RunResult[]> {
    const results: RunResult[] = [];
    for (const run of runs) {
        const result = await judgeRun(deps, run);
        each(result);
        results.push(result);
    }
    return results;
}
