import { JUDGE } from './judge.ts';
import { allPass, flips, mcnemarExact, quantile, wilson } from './stats.ts';
import type { Answer, ConfigSummary, Config, CriterionStats, CriterionSummary, EvalSpec, FailureKind, Item, Judged, JudgeTotals, Mark, Paired, RunSummary } from './types.ts';

export const AUDIT = 'The expected answers were written by a model and audited by nobody yet.';

export const CAN: readonly string[] = [
    'Per job, which configurations break the contract, are refused by a gate or miss a planted case.',
    'A difference between two configurations of about 25 points or more on about 24 paired items.',
    'Calls, tokens, seconds and cost per configuration.',
];

export const CANNOT: readonly string[] = [
    'How often any failure happens in real use: planted cases are chosen, not sampled.',
    'A pass against a bar: about 24 items give intervals of 30 to 40 points.',
    'That the expected answers are right: a model wrote them and nobody audited them. An item every configuration fails is first a suspect item.',
    'That mocked inputs behave like real ones.',
    'A best configuration beyond this set: once a configuration is chosen on it, it is a development set.',
];

export interface Scored {
    readonly answer: Answer;
    readonly parsed: boolean;
    readonly failure_kind: FailureKind | null;
    readonly marks: Readonly<Record<string, Mark>>;
}

export function criteriaOf<I, E>(spec: EvalSpec<I, E>, judgeCheck: Readonly<Record<string, boolean>>): CriterionSummary[] {
    return [
        ...spec.codeCriteria.map((id) => ({ id, kind: 'code' as const, validated: null })),
        ...(spec.judge?.criteria ?? []).map((criterion) => ({ id: criterion.id, kind: 'judge' as const, validated: judgeCheck[criterion.id] ?? false })),
    ];
}

export function scoreAll<I, E>(spec: EvalSpec<I, E>, answers: readonly Answer[], judged: ReadonlyMap<string, Judged>): Scored[] {
    const items = new Map<string, Item<I, E>>(spec.items.map((item) => [item.id, item]));
    return answers.map((answer) => {
        const item = items.get(answer.id);
        if (item === undefined) throw new Error(`answer ${answer.key} names an item that is not in the dataset`);
        const graded = answer.text === null ? null : spec.grade(item, answer.text);
        const marks: Record<string, Mark> = {};
        for (const criterion of spec.codeCriteria) marks[criterion] = graded === null ? null : (graded.marks[criterion] ?? null);
        for (const criterion of spec.judge?.criteria ?? []) marks[criterion.id] = graded === null ? null : !graded.parsed ? false : (judged.get(answer.key)?.verdicts[criterion.id]?.passed ?? null);
        const failure = answer.failure_kind ?? (graded !== null && !graded.parsed ? 'unparsed' : null);
        return { answer, parsed: graded?.parsed ?? false, failure_kind: failure, marks };
    });
}

function itemMarks(scored: readonly Scored[], config: string, criterion: string): Map<string, Mark[]> {
    const byItem = new Map<string, Mark[]>();
    for (const each of scored) {
        if (each.answer.config !== config) continue;
        const list = byItem.get(each.answer.id) ?? [];
        list.push(each.marks[criterion] ?? null);
        byItem.set(each.answer.id, list);
    }
    return byItem;
}

function itemPass(scored: readonly Scored[], config: string, criterion: string): Map<string, Mark> {
    const result = new Map<string, Mark>();
    for (const [id, marks] of itemMarks(scored, config, criterion)) result.set(id, allPass(marks));
    return result;
}

function criterionStats(scored: readonly Scored[], config: string, criterion: string): CriterionStats {
    const marks = scored.filter((each) => each.answer.config === config).map((each) => each.marks[criterion] ?? null);
    const known = marks.filter((mark): mark is boolean => mark !== null);
    const items = [...itemPass(scored, config, criterion).values()].filter((mark): mark is boolean => mark !== null);
    return {
        answers: wilson(known.filter(Boolean).length, known.length),
        missing: marks.length - known.length,
        items: wilson(items.filter(Boolean).length, items.length),
        flips: flips(itemMarks(scored, config, criterion)),
    };
}

function configSummary(scored: readonly Scored[], config: Config, criteria: readonly CriterionSummary[]): ConfigSummary {
    const mine = scored.filter((each) => each.answer.config === config.name);
    const failures: Record<string, number> = {};
    for (const each of mine) if (each.failure_kind !== null) failures[each.failure_kind] = (failures[each.failure_kind] ?? 0) + 1;
    const costs = mine.map((each) => each.answer.cost_usd);
    const cost = costs.length === 0 || costs.some((value) => value === null) ? null : costs.reduce<number>((total, value) => total + (value ?? 0), 0);
    const latencies = mine.filter((each) => each.answer.failure_kind === null).map((each) => each.answer.latency_ms);
    const stats: Record<string, CriterionStats> = {};
    for (const criterion of criteria) stats[criterion.id] = criterionStats(scored, config.name, criterion.id);
    return {
        name: config.name,
        backend: config.backend,
        model: config.model,
        effort: config.effort,
        shipped: config.shipped === true,
        graded_by_own_model: config.model === JUDGE.model,
        answers: mine.length,
        calls: mine.reduce((total, each) => total + each.answer.attempts, 0),
        failures,
        anomalies: mine.filter((each) => each.answer.anomalies.length > 0).length,
        criteria: stats,
        input_tokens: mine.reduce((total, each) => total + each.answer.input_tokens, 0),
        output_tokens: mine.reduce((total, each) => total + each.answer.output_tokens, 0),
        reasoning_tokens: mine.reduce((total, each) => total + each.answer.reasoning_tokens, 0),
        cost_usd: cost,
        cost_basis: [...new Set(mine.map((each) => each.answer.cost_basis).filter((basis): basis is string => basis !== null))],
        cost_per_1000_items_usd: cost === null || mine.length === 0 ? null : (cost / mine.length) * 1000,
        latency_median_ms: quantile(latencies, 0.5),
        latency_p90_ms: quantile(latencies, 0.9),
    };
}

function pairedOf(scored: readonly Scored[], config: string, versus: string, criterion: string): Paired {
    const first = itemPass(scored, config, criterion);
    const second = itemPass(scored, versus, criterion);
    let both = 0;
    let onlyConfig = 0;
    let onlyVersus = 0;
    let neither = 0;
    for (const [id, mark] of first) {
        const other = second.get(id);
        if (mark === null || other === undefined || other === null) continue;
        if (mark && other) both += 1;
        else if (mark) onlyConfig += 1;
        else if (other) onlyVersus += 1;
        else neither += 1;
    }
    return { config, versus, criterion, both, only_config: onlyConfig, only_versus: onlyVersus, neither, p: mcnemarExact(onlyConfig, onlyVersus) };
}

function decisionOf(configs: readonly ConfigSummary[], paired: readonly Paired[], shipped: string): string[] {
    if (configs.every((config) => config.answers === 0)) return ['No answers yet: nothing to decide.', AUDIT];
    const base = configs.find((config) => config.name === shipped);
    const lines: string[] = [];
    const money = (config: ConfigSummary): string => (config.cost_usd === null ? 'cost not reported' : `$${config.cost_usd.toFixed(4)}`);
    const pace = (config: ConfigSummary): string => (config.latency_median_ms === null ? 'n/a' : `${Math.round(config.latency_median_ms)} ms`);
    for (const config of configs) {
        if (config.name === shipped) continue;
        const mine = paired.filter((pair) => pair.config === config.name);
        const better = mine.filter((pair) => pair.only_config > pair.only_versus && pair.p < 0.05).map((pair) => pair.criterion);
        const worse = mine.filter((pair) => pair.only_versus > pair.only_config && pair.p < 0.05).map((pair) => `${pair.criterion} (p=${pair.p.toFixed(3)})`);
        if (better.length > 0 && worse.length === 0) lines.push(`Candidate: ${config.name} is better than ${shipped} on ${better.join(', ')} (exact McNemar p < 0.05) and worse on none. Confirm on fresh items before switching.`);
        else if (worse.length > 0) lines.push(`${config.name} is worse than ${shipped} on ${worse.join(', ')}.`);
        else if (base !== undefined) lines.push(`${config.name} is not measurably different from ${shipped} on any criterion: ${money(config)} against ${money(base)}, median ${pace(config)} against ${pace(base)}.`);
    }
    if (!lines.some((line) => line.startsWith('Candidate:'))) lines.unshift(`Keep ${shipped}: no configuration is better than it on any criterion at p < 0.05 without being worse on another.`);
    lines.push(`Provisional: ${AUDIT}`);
    return lines;
}

function suspectsOf(scored: readonly Scored[], configs: readonly Config[], criteria: readonly CriterionSummary[]): { readonly criterion: string; readonly ids: readonly string[] }[] {
    const ids = [...new Set(scored.map((each) => each.answer.id))].sort();
    return criteria.map((criterion) => {
        const maps = configs.map((config) => itemPass(scored, config.name, criterion.id));
        return { criterion: criterion.id, ids: ids.filter((id) => maps.length > 0 && maps.every((map) => map.get(id) === false)) };
    }).filter((entry) => entry.ids.length > 0);
}

function judgeTotals(judged: readonly Judged[], hasJudge: boolean): JudgeTotals | null {
    if (!hasJudge) return null;
    const failures: Record<string, number> = {};
    for (const row of judged) if (row.failure_kind !== null) failures[row.failure_kind] = (failures[row.failure_kind] ?? 0) + 1;
    const costs = judged.map((row) => row.cost_usd);
    return {
        model: JUDGE.model,
        answers_judged: judged.length,
        calls: judged.reduce((total, row) => total + row.calls, 0),
        failures,
        missing_marks: judged.reduce((total, row) => total + Object.values(row.verdicts).filter((verdict) => verdict.passed === null).length, 0),
        input_tokens: judged.reduce((total, row) => total + row.input_tokens, 0),
        output_tokens: judged.reduce((total, row) => total + row.output_tokens, 0),
        cost_usd: costs.some((value) => value === null) ? null : costs.reduce<number>((total, value) => total + (value ?? 0), 0),
    };
}

export function summarize<I, E>(input: {
    readonly spec: EvalSpec<I, E>;
    readonly label: string;
    readonly stub: boolean;
    readonly configs: readonly Config[];
    readonly items: number;
    readonly repetitions: number;
    readonly scored: readonly Scored[];
    readonly judged: readonly Judged[];
    readonly judgeCheck: Readonly<Record<string, boolean>>;
    readonly datasetSha: string;
    readonly promptSha: string;
}): RunSummary {
    const criteria = criteriaOf(input.spec, input.judgeCheck);
    const shipped = (input.configs.find((config) => config.shipped === true) ?? input.configs[0])?.name ?? '';
    const configs = input.configs.map((config) => configSummary(input.scored, config, criteria));
    const paired = input.configs.filter((config) => config.name !== shipped).flatMap((config) => criteria.map((criterion) => pairedOf(input.scored, config.name, shipped, criterion.id)));
    const ownModel = configs.filter((config) => config.graded_by_own_model).map((config) => config.name);
    const cannot = [...CANNOT, ...(input.spec.notes?.cannot ?? [])];
    if (input.spec.judge !== null) cannot.push('Judge agreement with the owner: the judge criteria are checked only against planted labels, in judge-agreement part B.');
    if (input.spec.judge !== null && ownModel.length > 0) cannot.push(`An independent judge grade of ${ownModel.join(', ')}: the judge (${JUDGE.model}) grades its own model there.`);
    return {
        eval: input.spec.name,
        label: input.label,
        stub: input.stub,
        written_at: new Date().toISOString(),
        dataset_sha256: input.datasetSha,
        prompt_sha256: input.promptSha,
        items: input.items,
        repetitions: input.repetitions,
        audit: AUDIT,
        shipped,
        criteria,
        configs,
        paired,
        suspects: suspectsOf(input.scored, input.configs, criteria),
        judge: judgeTotals(input.judged, input.spec.judge !== null),
        decision: decisionOf(configs, paired, shipped),
        can: [...CAN, ...(input.spec.notes?.can ?? [])],
        cannot,
    };
}
