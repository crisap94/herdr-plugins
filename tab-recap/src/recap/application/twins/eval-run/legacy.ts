import type { JudgePort } from '#src/ports/judge.ts';
import type { RunFilter, RunInputReader } from '#src/ports/run-inputs.ts';
import type { VerdictStore } from '#src/ports/verdicts.ts';
import { must } from '#src/protocol/result.ts';
import { countOf, parseCount, type Count } from '#src/recap/domain/count.ts';
import { uncheckedTabId } from '#src/recap/domain/ids.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { agreeLines, candidateText, gateLines, reportText } from '#src/recap/render/eval.ts';
import type { Style } from '#src/recap/render/wrap.ts';
import { answerOf, candidatesOf, labelVerdicts } from '../../eval-label.ts';
import type { Candidate } from '../../eval-label.ts';
import type { EvalRequest } from '../../eval-request.ts';
import { reportOf } from '../../eval-report.ts';
import type { EvalReport } from '../../eval-report.ts';
import { agreementOf, gateReportOf } from '../../eval-stats.ts';
import type { Agreement } from '../../eval-stats.ts';
import { withText } from '../../judge-anchors.ts';
import { judgeRuns } from '../../judge.ts';
import type { JudgeDeps } from '../../judge.ts';
import { installableHarnessSentence } from '#src/recap/domain/backend.ts';

const DAY_MS = 86_400_000;
const LABEL_RUNS = 200;

export interface EvalDeps {
    readonly inputs: RunInputReader;
    readonly verdicts: VerdictStore;
    readonly now: () => number;
    readonly judge: () => JudgePort | null;
    readonly rubric: string;
    readonly style: Style;
    out(line: string): void;
    err(line: string): void;
    ask(prompt: string): Promise<string | null>;
}

const reportJson = (report: EvalReport, missing: Count): Text => textOf(JSON.stringify({
    ...report,
    runs: report.runs.map((line) => ({ ...line, run: { id: line.run.id, tab: line.run.tab, at: line.run.at, language: line.run.language, backend: line.run.backend, hasInput: line.run.input === 'present', gateStats: line.run.gateStats } })),
    missingInput: missing,
}));

const agreeJson = (rows: readonly Agreement[]): Text => textOf(JSON.stringify(rows.map((row) => ({
    ...row,
    worst: row.worst.map((one) => ({ run: one.run, item: one.item, check: one.check, judge: one.judge === 'pass', operator: one.operator === 'pass', judgeCritique: one.judgeCritique, reason: one.reason, at: one.at, text: one.text })),
}))));

const queryOf = (options: EvalRequest, deps: EvalDeps, limit: number, withInput: boolean): RunFilter =>
    ({ tab: options.tab === null ? null : uncheckedTabId(options.tab), since: options.since === null ? null : instant(deps.now() - options.since * DAY_MS), limit: countOf(limit), input: withInput ? 'with-input' : 'any' });

async function sample(options: EvalRequest, deps: EvalDeps): Promise<number> {
    const judge = deps.judge();
    if (judge === null) {
        deps.err(`tab-recap: 1 — no harness is available for the judge job: install ${installableHarnessSentence()}, or set TAB_RECAP_JUDGE_BY`);
        return 1;
    }
    const runs = deps.inputs.runs(queryOf(options, deps, options.count, true));
    const missing = deps.inputs.runs(queryOf(options, deps, 1000, false)).filter((run) => run.input === 'absent').length;
    const judging: JudgeDeps = { judge, inputs: deps.inputs, verdicts: deps.verdicts, rubric: must(parseText(deps.rubric)), now: () => instant(deps.now()) };
    let done = 0;
    const results = await judgeRuns(judging, runs, () => { done += 1; deps.err(`judged ${done}/${runs.length}`); });
    const report = reportOf(judge.label, results);
    deps.out(options.json === 'present' ? reportJson(report, countOf(missing)) : reportText(report, deps.style, must(parseCount(missing))).join('\n'));
    return results.length > 0 && results.every((result) => result.kind === 'not-judged') ? 1 : 0;
}

async function labelOne(candidate: Candidate, position: string, deps: EvalDeps, check: Text | null): Promise<boolean> {
    deps.out(candidateText(candidate, must(parseText(position)), deps.style).join('\n'));
    for (;;) {
        const line = await deps.ask(check === null ? 'ok / fail [I1…I7 S-section …] / skip / quit > ' : `${check}: ok / fail / skip / quit > `);
        const answer = line === null ? { kind: 'quit' } as const : answerOf(must(parseText(line)), candidate.section, check);
        if (answer.kind === 'again') {
            deps.err(answer.why);
        } else if (answer.kind === 'pass' || answer.kind === 'fail') {
            const reason = answer.kind === 'fail' ? ((await deps.ask('why? > ')) ?? '').trim() : '';
            deps.verdicts.add(labelVerdicts(candidate, answer, must(parseText(reason)), instant(deps.now()), check));
            return true;
        } else {
            return answer.kind === 'skip';
        }
    }
}

async function label(options: EvalRequest, deps: EvalDeps): Promise<number> {
    const runs = deps.inputs.runs(queryOf(options, deps, LABEL_RUNS, false));
    const check = options.check;
    const labelled = new Set(deps.verdicts.labelled(options.check));
    const items = candidatesOf(runs, deps.inputs, labelled, must(parseCount(options.count)), check);
    if (items.length === 0) {
        deps.out(options.check === null ? 'no unlabelled items in the period' : `no items in the period that ${options.check} has not been asked about`);
        return 0;
    }
    let done = 0;
    for (const [at, item] of items.entries()) {
        if (!(await labelOne(item, `${at + 1}/${items.length}`, deps, check))) {
            break;
        }
        done += 1;
    }
    deps.out(`${done} of ${items.length} items answered; \`tab-recap eval --agree\` compares them with the judge`);
    return 0;
}

export async function runEval(options: EvalRequest, deps: EvalDeps): Promise<number> {
    switch (options.mode) {
        case 'sample':
            return sample(options, deps);
        case 'label':
            return label(options, deps);
        case 'agree': {
            const rows = agreementOf(deps.verdicts.pairs(), withText(deps.verdicts.disagreements(), deps.inputs));
            deps.out(options.json === 'present' ? agreeJson(rows) : agreeLines(rows, deps.style).join('\n'));
            return 0;
        }
        case 'gates': {
            const report = gateReportOf(deps.inputs.gateCounts(options.since === null ? null : instant(deps.now() - options.since * DAY_MS)));
            deps.out(options.json === 'present' ? JSON.stringify(report) : gateLines(report, deps.style).join('\n'));
            return 0;
        }
        case 'replay':
            deps.err('tab-recap: 2 — --replay is run by the command, not by this report');
            return 2;
        default: {
            const exhaustive: never = options.mode;
            return Number(exhaustive);
        }
    }
}
