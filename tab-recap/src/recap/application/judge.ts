import type { Judge } from '#src/ports/judge.ts';
import type { RunInputs, RunItem, StoredRun } from '#src/ports/run-inputs.ts';
import type { Verdict, Verdicts } from '#src/ports/verdicts.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { gradingDocument, readbackDocument, scoringDocument } from './judge-context.ts';
import { parseAnswers, parseGrades, parseScore } from './judge-answer.ts';
import { measureState } from './judge-coverage.ts';
import type { Measured, Row, Share } from './judge-coverage.ts';
import type { Grade } from './judge-answer.ts';

export interface JudgeDeps {
    readonly judge: Judge;
    readonly inputs: RunInputs;
    readonly verdicts: Verdicts;
    readonly rubric: Text;
    readonly now: () => number;
}

export type { Share } from './judge-coverage.ts';

export type RunResult =
    | {
        readonly kind: 'judged'; readonly run: StoredRun; readonly items: readonly RunItem[]; readonly verdicts: readonly Verdict[]; readonly coverage: Share; readonly filler: Share;
        readonly added: Measured['added']; readonly stateSize: Count; readonly readback: readonly Grade[] | null; readonly note: Text | null; readonly costUsd: number;
    }
    | { readonly kind: 'not-judged'; readonly run: StoredRun; readonly why: Text; readonly costUsd: number };

interface ReadBackParts { readonly items: readonly RunItem[]; readonly input: Text; readonly keyfacts: readonly Text[] }

interface ReadBackResult { readonly grades: readonly Grade[] | null; readonly note: Text | null; readonly costUsd: number }

export async function readBack(deps: JudgeDeps, parts: ReadBackParts): Promise<ReadBackResult> {
    const asked = await deps.judge.ask('readback', readbackDocument(parts.items));
    if (isUnknown(asked)) {
        return { grades: null, note: must(parseText(`read-back: ${saying(asked.why)}`)), costUsd: 0 };
    }
    const answers = parseAnswers(must(parseText(asked.text)));
    if (answers.kind === 'unusable') {
        return { grades: null, note: must(parseText(`read-back: ${answers.why}`)), costUsd: asked.costUsd };
    }
    const graded = await deps.judge.ask('grade', gradingDocument({ input: parts.input, keyfacts: parts.keyfacts, answers: answers.value }));
    if (isUnknown(graded)) {
        return { grades: null, note: must(parseText(`read-back grading: ${saying(graded.why)}`)), costUsd: asked.costUsd };
    }
    const grades = parseGrades(must(parseText(graded.text)));
    return { grades: grades.kind === 'ok' ? grades.value : null, note: grades.kind === 'ok' ? null : must(parseText(`read-back grading: ${grades.why}`)), costUsd: asked.costUsd + graded.costUsd };
}

const critique = (line: Text): Text | null => (line === '' ? null : line);

const verdictOf = (deps: JudgeDeps, run: StoredRun, row: Row): Verdict => ({ run: run.id, item: row.item, check: row.check, pass: row.pass, critique: row.critique, judge: deps.judge.label, at: deps.now(), source: 'judge' });

const notJudged = (run: StoredRun, why: Text, costUsd = 0): RunResult => ({ kind: 'not-judged', run, why, costUsd });

export async function judgeRun(deps: JudgeDeps, run: StoredRun): Promise<RunResult> {
    const input = deps.inputs.document(run.id);
    const items = deps.inputs.itemsOf(run.id, 'added');
    const state = deps.inputs.itemsOf(run.id, 'state');
    if (input === null) {
        return notJudged(run, must(parseText('its input is no longer stored')));
    }
    if (items.length === 0) {
        return notJudged(run, must(parseText('it wrote no items')));
    }
    const asked = await deps.judge.ask('score', scoringDocument({ rubric: deps.rubric, input: must(parseText(input)), items, state }));
    if (isUnknown(asked)) {
        return notJudged(run, must(parseText(saying(asked.why))));
    }
    const scored = parseScore(must(parseText(asked.text)), new Map(items.map((item): [Text, Text] => [must(parseText(item.key)), must(parseText(item.section))])), new Map(state.map((item): [Text, Text] => [must(parseText(item.key)), must(parseText(item.section))])));
    if (scored.kind === 'unusable') {
        return notJudged(run, scored.why, asked.costUsd);
    }
    const measured = measureState(state, scored.value);
    const back = await readBack(deps, { items: state, input: must(parseText(input)), keyfacts: scored.value.keyfacts });
    const rows: readonly Row[] = [
        ...scored.value.verdicts.map((verdict): Row => ({ item: verdict.item, check: verdict.check, pass: verdict.pass === 'pass', critique: critique(verdict.critique) })),
        ...measured.rows,
        ...(back.grades ?? []).map((grade): Row => ({ item: null, check: `readback-${grade.question}`, pass: grade.pass, critique: critique(grade.critique) })),
    ];
    const verdicts = rows.map((row): Verdict => verdictOf(deps, run, row));
    deps.verdicts.add(verdicts);
    return {
        kind: 'judged', run, items, verdicts, coverage: measured.coverage, filler: measured.filler, added: measured.added, stateSize: must(parseCount(state.length)),
        readback: back.grades, note: back.note, costUsd: asked.costUsd + back.costUsd,
    };
}

export async function judgeRuns(deps: JudgeDeps, runs: readonly StoredRun[], each: (result: RunResult) => void = (): void => undefined): Promise<readonly RunResult[]> {
    const results: RunResult[] = [];
    for (const run of runs) {
        const result = await judgeRun(deps, run);
        each(result);
        results.push(result);
    }
    return results;
}
