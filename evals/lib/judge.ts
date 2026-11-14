import { join } from 'node:path';
import { parseJson, quoted } from './scoring.ts';
import { appendJsonl, callWithBackoff, lastByKey, pool, readJsonl } from './runner.ts';
import type { Pause, RunOptions } from './runner.ts';
import type { Adapter, Answer, Called, EvalSpec, FailureKind, Item, JudgeCriterion, JudgeVerdict, JudgeView, Judged } from './types.ts';

export const JUDGE = { model: 'claude-sonnet-5-5', effort: 'medium', timeoutMs: 180000, maxTurns: 3 } as const;

export function judgeSystem(criteria: readonly JudgeCriterion[]): string {
    return [
        'You are a strict grader. You judge one answer against several criteria, each on its own.',
        'The burden of proof is on passing: give pass for a criterion only when you can quote the exact words that show it is met; when in doubt, give fail.',
        'For a pass, evidence is a verbatim quote from the answer or the case, copied exactly, at most 300 characters.',
        'For a fail, evidence quotes the words that breach the criterion, or is an empty string when the criterion fails for lack of evidence.',
        'Return exactly one verdict for every criterion id below, and no other.',
        '',
        'Criteria:',
        ...criteria.map((criterion) => `- ${criterion.id}: passes when ${criterion.rule} Breach: ${criterion.breach}`),
    ].join('\n');
}

export const judgeUser = (view: JudgeView): string => `<case>\n${view.case}\n</case>\n<answer>\n${view.answer}\n</answer>`;

export function judgeSchema(criteria: readonly JudgeCriterion[]): Record<string, unknown> {
    return {
        type: 'object',
        properties: {
            verdicts: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        criterion: { type: 'string', enum: criteria.map((criterion) => criterion.id) },
                        verdict: { type: 'string', enum: ['pass', 'fail'] },
                        evidence: { type: 'string' },
                    },
                    required: ['criterion', 'verdict', 'evidence'],
                    additionalProperties: false,
                },
            },
        },
        required: ['verdicts'],
        additionalProperties: false,
    };
}

export function parseVerdicts(called: Called, criteria: readonly JudgeCriterion[]): Map<string, { readonly pass: boolean; readonly evidence: string }> | null {
    const raw = called.structured !== undefined && called.structured !== null ? called.structured : called.text === null ? null : parseJson(called.text);
    if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { verdicts?: unknown }).verdicts)) return null;
    const found = new Map<string, { readonly pass: boolean; readonly evidence: string }>();
    for (const entry of (raw as { verdicts: unknown[] }).verdicts) {
        if (typeof entry !== 'object' || entry === null) return null;
        const { criterion, verdict, evidence } = entry as { criterion?: unknown; verdict?: unknown; evidence?: unknown };
        if (typeof criterion !== 'string' || (verdict !== 'pass' && verdict !== 'fail') || typeof evidence !== 'string') return null;
        if (found.has(criterion) || !criteria.some((each) => each.id === criterion)) return null;
        found.set(criterion, { pass: verdict === 'pass', evidence });
    }
    return criteria.every((criterion) => found.has(criterion.id)) ? found : null;
}

export async function judgeOne(adapter: Adapter, criteria: readonly JudgeCriterion[], view: JudgeView, backoffMs: readonly number[], pause: Pause, log: (line: string) => void): Promise<Omit<Judged, 'key' | 'id' | 'config' | 'repetition' | 'at'>> {
    const call = { system: judgeSystem(criteria), user: judgeUser(view), model: JUDGE.model, effort: JUDGE.effort, timeoutMs: JUDGE.timeoutMs, maxTurns: JUDGE.maxTurns, schema: judgeSchema(criteria) };
    let calls = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cost: number | null = 0;
    let latency = 0;
    let failure: FailureKind = 'unparsed';
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        const { called, attempts } = await callWithBackoff(adapter, call, backoffMs, pause, log);
        calls += attempts;
        inputTokens += called.input_tokens;
        outputTokens += called.output_tokens;
        cost = cost === null || called.cost_usd === null ? null : cost + called.cost_usd;
        latency += called.latency_ms;
        if (called.failure_kind !== null) {
            failure = called.failure_kind;
            continue;
        }
        const parsed = parseVerdicts(called, criteria);
        if (parsed === null) {
            failure = 'unparsed';
            continue;
        }
        const verdicts: Record<string, JudgeVerdict> = {};
        for (const criterion of criteria) {
            const got = parsed.get(criterion.id);
            if (got === undefined) continue;
            if (!got.pass) verdicts[criterion.id] = { passed: false, evidence: got.evidence, note: '' };
            else if (quoted(got.evidence, [view.answer, view.case])) verdicts[criterion.id] = { passed: true, evidence: got.evidence, note: '' };
            else verdicts[criterion.id] = { passed: null, evidence: got.evidence, note: 'pass without a verbatim quote: scored missing' };
        }
        return { verdicts, calls, failure_kind: null, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: cost, latency_ms: latency };
    }
    const verdicts: Record<string, JudgeVerdict> = {};
    for (const criterion of criteria) verdicts[criterion.id] = { passed: null, evidence: '', note: `judge ${failure} twice: scored missing` };
    return { verdicts, calls, failure_kind: failure, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: cost, latency_ms: latency };
}

export async function judgeAll<I, E>(spec: EvalSpec<I, E>, options: RunOptions, dir: string, answers: readonly Answer[], adapter: Adapter): Promise<{ readonly made: number; readonly capped: boolean }> {
    const judge = spec.judge;
    if (judge === null) return { made: 0, capped: false };
    const file = join(dir, 'judge.jsonl');
    const rows = readJsonl<Judged>(file);
    const done = lastByKey(rows);
    let calls = rows.reduce((total, row) => total + row.calls, 0);
    let made = 0;
    let capped = false;
    const items = new Map<string, Item<I, E>>(spec.items.map((item) => [item.id, item]));
    const work = answers.filter((answer) => {
        if (answer.text === null) return false;
        const item = items.get(answer.id);
        if (item === undefined || !spec.grade(item, answer.text).parsed) return false;
        const prior = done.get(answer.key);
        return prior === undefined || (options.retryFailed && prior.failure_kind !== null);
    });
    options.log(`${spec.name}: ${work.length} answers to judge`);
    const pause: Pause = { until: 0 };
    await pool(work, options.concurrency, async (answer) => {
        if (calls >= options.maxJudgeCalls) {
            capped = true;
            return;
        }
        const item = items.get(answer.id) as Item<I, E>;
        const view = judge.view(item, answer.text ?? '');
        calls += 1;
        const result = await judgeOne(adapter, judge.criteria, view, options.stub ? [] : options.backoffMs, pause, options.log);
        calls += result.calls - 1;
        made += 1;
        appendJsonl(file, { key: answer.key, id: answer.id, config: answer.config, repetition: answer.repetition, ...result, at: new Date().toISOString() });
    });
    if (capped) options.log(`judge cap ${options.maxJudgeCalls} reached; rerun with the same label and a higher --max-judge-calls to continue`);
    return { made, capped };
}
