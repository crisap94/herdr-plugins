import type { JudgePort } from '#src/ports/judge.ts';
import type { InputFilter, RunFilter, RunInputReader } from '#src/ports/run-inputs.ts';
import type { VerdictStore } from '#src/ports/verdicts.ts';
import { countOf, type Count } from '#src/recap/domain/count.ts';
import { uncheckedTabId } from '#src/recap/domain/ids.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { agreeLines, candidateText, gateLines, reportText } from '#src/recap/render/eval.ts';
import type { Style } from '#src/recap/render/wrap.ts';
import { installableHarnessSentence } from '#src/recap/domain/backend.ts';
import { answerOf, candidatesOf, labelVerdicts } from './eval-label.ts';
import type { Candidate } from './eval-label.ts';
import type { EvalRequest } from './eval-request.ts';
import { reportOf } from './eval-report.ts';
import type { EvalReport } from './eval-report.ts';
import { agreementOf, gateReportOf } from './eval-stats.ts';
import type { Agreement, GateReport } from './eval-stats.ts';
import { withText } from './judge-anchors.ts';
import { judgeRuns } from './judge.ts';
import type { JudgeDeps } from './judge.ts';

const DAY_MS = 86_400_000;
const LABEL_RUNS = countOf(200);
const MISSING_RUNS = countOf(1000);

export type EvalExit = 0 | 1 | 2;

type LabelStep = 'next' | 'stop';

export interface EvalDeps {
    readonly inputs: RunInputReader;
    readonly verdicts: VerdictStore;
    readonly now: () => Instant;
    readonly judge: () => JudgePort | null;
    readonly rubric: Text;
    readonly style: Style;
    out(line: Text): void;
    err(line: Text): void;
    ask(prompt: Text): Promise<Text | null>;
}

const reportJson = (report: EvalReport, missing: Count): Text => textOf(JSON.stringify({
    ...report,
    runs: report.runs.map((line) => ({
        ...line,
        run: { id: line.run.id, tab: line.run.tab, at: line.run.at, language: line.run.language, backend: line.run.backend, hasInput: line.run.input === 'present', gateStats: line.run.gateStats },
        ...(line.kind === 'judged' ? { readback: line.readback === null ? null : line.readback.map((grade) => ({ question: grade.question, pass: grade.pass === 'pass', critique: grade.critique })) } : {}),
    })),
    missingInput: missing,
}));

const agreeJson = (rows: readonly Agreement[]): Text => textOf(JSON.stringify(rows.map((row) => ({
    ...row,
    worst: row.worst.map((one) => ({ run: one.run, item: one.item, check: one.check, judge: one.judge === 'pass', operator: one.operator === 'pass', judgeCritique: one.judgeCritique, reason: one.reason, at: one.at, text: one.text })),
}))));

const gatesJson = (report: GateReport): Text => textOf(JSON.stringify(report));

const sinceOf = (options: EvalRequest, deps: EvalDeps): Instant | null => (options.since === null ? null : instant(deps.now() - options.since * DAY_MS));

const queryOf = (options: EvalRequest, deps: EvalDeps, limit: Count, input: InputFilter): RunFilter =>
    ({ tab: options.tab === null ? null : uncheckedTabId(options.tab), since: sinceOf(options, deps), limit, input });

async function sample(options: EvalRequest, deps: EvalDeps): Promise<EvalExit> {
    const judge = deps.judge();
    if (judge === null) {
        deps.err(textOf(`tab-recap: 1 — no harness is available for the judge job: install ${installableHarnessSentence()}, or set TAB_RECAP_JUDGE_BY`));
        return 1;
    }
    const runs = deps.inputs.runs(queryOf(options, deps, countOf(options.count), 'with-input'));
    const missing = countOf(deps.inputs.runs(queryOf(options, deps, MISSING_RUNS, 'any')).filter((run) => run.input === 'absent').length);
    const judging: JudgeDeps = { judge, inputs: deps.inputs, verdicts: deps.verdicts, rubric: deps.rubric, now: deps.now };
    let done = 0;
    const results = await judgeRuns(judging, runs, () => { done += 1; deps.err(textOf(`judged ${done}/${runs.length}`)); });
    const report = reportOf(judge.label, results);
    deps.out(options.json === 'present' ? reportJson(report, missing) : textOf(reportText(report, deps.style, missing).join('\n')));
    return results.length > 0 && results.every((result) => result.kind === 'not-judged') ? 1 : 0;
}

async function labelOne(candidate: Candidate, position: Text, deps: EvalDeps, check: Text | null): Promise<LabelStep> {
    deps.out(textOf(candidateText(candidate, position, deps.style).join('\n')));
    for (;;) {
        const line = await deps.ask(textOf(check === null ? 'ok / fail [I1…I7 S-section …] / skip / quit > ' : `${check}: ok / fail / skip / quit > `));
        const answer = line === null ? { kind: 'quit' } as const : answerOf(line, candidate.section, check);
        if (answer.kind === 'again') {
            deps.err(answer.why);
        } else if (answer.kind === 'pass' || answer.kind === 'fail') {
            const reason = answer.kind === 'fail' ? ((await deps.ask(textOf('why? > '))) ?? '').trim() : '';
            deps.verdicts.add(labelVerdicts(candidate, answer, textOf(reason), deps.now(), check));
            return 'next';
        } else {
            return answer.kind === 'skip' ? 'next' : 'stop';
        }
    }
}

async function label(options: EvalRequest, deps: EvalDeps): Promise<EvalExit> {
    const runs = deps.inputs.runs(queryOf(options, deps, LABEL_RUNS, 'any'));
    const check = options.check;
    const labelled = new Set(deps.verdicts.labelled(options.check));
    const items = candidatesOf(runs, deps.inputs, labelled, countOf(options.count), check);
    if (items.length === 0) {
        deps.out(textOf(options.check === null ? 'no unlabelled items in the period' : `no items in the period that ${options.check} has not been asked about`));
        return 0;
    }
    let done = 0;
    for (const [at, item] of items.entries()) {
        if (await labelOne(item, textOf(`${at + 1}/${items.length}`), deps, check) === 'stop') {
            break;
        }
        done += 1;
    }
    deps.out(textOf(`${done} of ${items.length} items answered; \`tab-recap eval --agree\` compares them with the judge`));
    return 0;
}

export async function runEval(options: EvalRequest, deps: EvalDeps): Promise<EvalExit> {
    switch (options.mode) {
        case 'sample':
            return sample(options, deps);
        case 'label':
            return label(options, deps);
        case 'agree': {
            const rows = agreementOf(deps.verdicts.pairs(), withText(deps.verdicts.disagreements(), deps.inputs));
            deps.out(options.json === 'present' ? agreeJson(rows) : textOf(agreeLines(rows, deps.style).join('\n')));
            return 0;
        }
        case 'gates': {
            const report = gateReportOf(deps.inputs.gateCounts(sinceOf(options, deps)));
            deps.out(options.json === 'present' ? gatesJson(report) : textOf(gateLines(report, deps.style).join('\n')));
            return 0;
        }
        case 'replay':
            deps.err(textOf('tab-recap: 2 — --replay is run by the command, not by this report'));
            return 2;
        default: {
            const exhaustive: never = options.mode;
            return exhaustive;
        }
    }
}
