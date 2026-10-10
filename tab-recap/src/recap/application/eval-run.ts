import type { Judge } from '#src/ports/judge.ts';
import type { RunInputs, RunQuery } from '#src/ports/run-inputs.ts';
import type { Verdicts } from '#src/ports/verdicts.ts';
import { agreeLines, candidateLines, gateLines, reportLines } from '#src/recap/render/eval.ts';
import type { Style } from '#src/recap/render/wrap.ts';
import { answerOf, candidatesOf, labelVerdicts } from './eval-label.ts';
import type { Candidate } from './eval-label.ts';
import type { EvalOptions } from './eval-options.ts';
import { reportOf } from './eval-report.ts';
import { agreementOf, gateReportOf } from './eval-stats.ts';
import { withText } from './judge-anchors.ts';
import { judgeRuns } from './judge.ts';
import type { JudgeDeps } from './judge.ts';

const DAY_MS = 86_400_000;
const LABEL_RUNS = 200;

export interface EvalDeps {
    readonly inputs: RunInputs;
    readonly verdicts: Verdicts;
    readonly now: () => number;
    readonly judge: () => Judge | null;
    readonly rubric: string;
    readonly style: Style;
    out(line: string): void;
    err(line: string): void;
    ask(prompt: string): Promise<string | null>;
}

const queryOf = (options: EvalOptions, deps: EvalDeps, limit: number, withInput: boolean): RunQuery =>
    ({ tab: options.tab, since: options.since === null ? null : deps.now() - options.since * DAY_MS, limit, withInput });

async function sample(options: EvalOptions, deps: EvalDeps): Promise<number> {
    const judge = deps.judge();
    if (judge === null) {
        deps.err(`tab-recap: 1 — no harness is available for the judge job: install ${installableHarnessSentence()}, or set TAB_RECAP_JUDGE_BY`);
        return 1;
    }
    const runs = deps.inputs.runs(queryOf(options, deps, options.count, true));
    const missing = deps.inputs.runs(queryOf(options, deps, 1000, false)).filter((run) => !run.hasInput).length;
    const judging: JudgeDeps = { judge, inputs: deps.inputs, verdicts: deps.verdicts, rubric: deps.rubric, now: deps.now };
    let done = 0;
    const results = await judgeRuns(judging, runs, () => { done += 1; deps.err(`judged ${done}/${runs.length}`); });
    const report = reportOf(judge.label, results);
    deps.out(options.json ? JSON.stringify({ ...report, missingInput: missing }) : reportLines(report, deps.style, missing).join('\n'));
    return results.length > 0 && results.every((result) => result.kind === 'not-judged') ? 1 : 0;
}

async function labelOne(candidate: Candidate, position: string, deps: EvalDeps, check: string | null): Promise<boolean> {
    deps.out(candidateLines(candidate, position, deps.style).join('\n'));
    for (;;) {
        const line = await deps.ask(check === null ? 'ok / fail [I1…I7 S-section …] / skip / quit > ' : `${check}: ok / fail / skip / quit > `);
        const answer = line === null ? { kind: 'quit' } as const : answerOf(line, candidate.section, check);
        if (answer.kind === 'again') {
            deps.err(answer.why);
        } else if (answer.kind === 'pass' || answer.kind === 'fail') {
            const reason = answer.kind === 'fail' ? ((await deps.ask('why? > ')) ?? '').trim() : '';
            deps.verdicts.add(labelVerdicts(candidate, answer, reason, deps.now(), check));
            return true;
        } else {
            return answer.kind === 'skip';
        }
    }
}

async function label(options: EvalOptions, deps: EvalDeps): Promise<number> {
    const runs = deps.inputs.runs(queryOf(options, deps, LABEL_RUNS, false));
    const items = candidatesOf(runs, deps.inputs, deps.verdicts.labelled(options.check), options.count, options.check);
    if (items.length === 0) {
        deps.out(options.check === null ? 'no unlabelled items in the period' : `no items in the period that ${options.check} has not been asked about`);
        return 0;
    }
    let done = 0;
    for (const [at, item] of items.entries()) {
        if (!(await labelOne(item, `${at + 1}/${items.length}`, deps, options.check))) {
            break;
        }
        done += 1;
    }
    deps.out(`${done} of ${items.length} items answered; \`tab-recap eval --agree\` compares them with the judge`);
    return 0;
}

export async function runEval(options: EvalOptions, deps: EvalDeps): Promise<number> {
    switch (options.mode) {
        case 'sample':
            return sample(options, deps);
        case 'label':
            return label(options, deps);
        case 'agree': {
            const rows = agreementOf(deps.verdicts.pairs(), withText(deps.verdicts.disagreements(), deps.inputs));
            deps.out(options.json ? JSON.stringify(rows) : agreeLines(rows, deps.style).join('\n'));
            return 0;
        }
        case 'gates': {
            const report = gateReportOf(deps.inputs.gateCounts(options.since === null ? null : deps.now() - options.since * DAY_MS));
            deps.out(options.json ? JSON.stringify(report) : gateLines(report, deps.style).join('\n'));
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
import { installableHarnessSentence } from '#src/recap/domain/backend.ts';
