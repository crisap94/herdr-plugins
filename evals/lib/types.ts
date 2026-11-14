export type Backend = 'claude' | 'codex';

export type FailureKind = 'config' | 'timeout' | 'rate_limit' | 'failed' | 'unparsed';

export type Mark = boolean | null;

export interface Config {
    readonly name: string;
    readonly backend: Backend;
    readonly model: string;
    readonly effort: string;
    readonly shipped?: boolean;
    readonly timeoutMs?: number;
}

export interface Item<I = unknown, E = unknown> {
    readonly id: string;
    readonly plants: readonly string[];
    readonly input: I;
    readonly expected: E;
}

export interface Prompt {
    readonly system: string;
    readonly user: string;
}

export interface Call {
    readonly system: string;
    readonly user: string;
    readonly model: string;
    readonly effort: string;
    readonly timeoutMs: number;
    readonly schema?: Record<string, unknown>;
    readonly maxTurns?: number;
}

export interface Called {
    readonly text: string | null;
    readonly structured: unknown;
    readonly failure_kind: FailureKind | null;
    readonly failure_detail: string | null;
    readonly input_tokens: number;
    readonly cache_read_tokens: number;
    readonly cache_write_tokens: number;
    readonly output_tokens: number;
    readonly reasoning_tokens: number;
    readonly cost_usd: number | null;
    readonly cost_basis: string | null;
    readonly latency_ms: number;
    readonly models: readonly string[];
    readonly anomalies: readonly string[];
}

export type Adapter = (call: Call) => Promise<Called>;

export interface Answer extends Called {
    readonly key: string;
    readonly id: string;
    readonly config: string;
    readonly repetition: number;
    readonly backend: Backend;
    readonly model: string;
    readonly effort: string;
    readonly attempts: number;
    readonly at: string;
}

export interface Graded {
    readonly parsed: boolean;
    readonly marks: Readonly<Record<string, Mark>>;
}

export interface JudgeCriterion {
    readonly id: string;
    readonly rule: string;
    readonly breach: string;
}

export interface JudgeView {
    readonly case: string;
    readonly answer: string;
}

export interface JudgeVerdict {
    readonly passed: Mark;
    readonly evidence: string;
    readonly note: string;
}

export interface Judged {
    readonly key: string;
    readonly id: string;
    readonly config: string;
    readonly repetition: number;
    readonly verdicts: Readonly<Record<string, JudgeVerdict>>;
    readonly calls: number;
    readonly failure_kind: FailureKind | null;
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly cost_usd: number | null;
    readonly latency_ms: number;
    readonly at: string;
}

export interface EvalSpec<I = unknown, E = unknown> {
    readonly name: string;
    readonly items: readonly Item<I, E>[];
    readonly configs: readonly Config[];
    readonly repetitions: number;
    readonly codeCriteria: readonly string[];
    readonly judge: {
        readonly criteria: readonly JudgeCriterion[];
        readonly view: (item: Item<I, E>, text: string) => JudgeView;
    } | null;
    readonly prompt: (item: Item<I, E>) => Prompt;
    readonly grade: (item: Item<I, E>, text: string) => Graded;
    readonly stub: (item: Item<I, E>, config: Config, repetition: number) => string;
    readonly notes?: {
        readonly can: readonly string[];
        readonly cannot: readonly string[];
    };
}

export interface Interval {
    readonly k: number;
    readonly n: number;
    readonly low: number;
    readonly high: number;
}

export interface CriterionSummary {
    readonly id: string;
    readonly kind: 'code' | 'judge';
    readonly validated: boolean | null;
}

export interface CriterionStats {
    readonly answers: Interval;
    readonly missing: number;
    readonly items: Interval;
    readonly flips: readonly string[];
}

export interface ConfigSummary {
    readonly name: string;
    readonly backend: Backend;
    readonly model: string;
    readonly effort: string;
    readonly shipped: boolean;
    readonly graded_by_own_model: boolean;
    readonly answers: number;
    readonly calls: number;
    readonly failures: Readonly<Record<string, number>>;
    readonly anomalies: number;
    readonly criteria: Readonly<Record<string, CriterionStats>>;
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly reasoning_tokens: number;
    readonly cost_usd: number | null;
    readonly cost_basis: readonly string[];
    readonly cost_per_1000_items_usd: number | null;
    readonly latency_median_ms: number | null;
    readonly latency_p90_ms: number | null;
}

export interface Paired {
    readonly config: string;
    readonly versus: string;
    readonly criterion: string;
    readonly both: number;
    readonly only_config: number;
    readonly only_versus: number;
    readonly neither: number;
    readonly p: number;
}

export interface JudgeTotals {
    readonly model: string;
    readonly answers_judged: number;
    readonly calls: number;
    readonly failures: Readonly<Record<string, number>>;
    readonly missing_marks: number;
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly cost_usd: number | null;
}

export interface RunSummary {
    readonly eval: string;
    readonly label: string;
    readonly stub: boolean;
    readonly written_at: string;
    readonly dataset_sha256: string;
    readonly prompt_sha256: string;
    readonly items: number;
    readonly repetitions: number;
    readonly audit: string;
    readonly shipped: string;
    readonly criteria: readonly CriterionSummary[];
    readonly configs: readonly ConfigSummary[];
    readonly paired: readonly Paired[];
    readonly suspects: readonly { readonly criterion: string; readonly ids: readonly string[] }[];
    readonly judge: JudgeTotals | null;
    readonly decision: readonly string[];
    readonly can: readonly string[];
    readonly cannot: readonly string[];
}
