import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubCalled } from './stub.ts';
import type { Adapter, Answer, Backend, Call, Called, Config, EvalSpec, Item } from './types.ts';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_TIMEOUT_MS = 300000;
const TRANSIENT: readonly string[] = ['timeout', 'rate_limit', 'failed'];

export interface RunOptions {
    readonly label: string;
    readonly root: string;
    readonly stub: boolean;
    readonly seed: number;
    readonly repetitions: number;
    readonly configs: readonly string[] | null;
    readonly itemLimit: number | null;
    readonly maxCalls: number;
    readonly maxJudgeCalls: number;
    readonly concurrency: number;
    readonly retryFailed: boolean;
    readonly backoffMs: readonly number[];
    readonly adapters: Readonly<Record<Backend, Adapter>>;
    readonly judgeAdapter: Adapter | null;
    readonly judgeCheck: Readonly<Record<string, boolean>>;
    readonly reportOnly: boolean;
    readonly log: (line: string) => void;
}

function realOrSelf(path: string): string {
    let current = resolve(path);
    const rest: string[] = [];
    while (!existsSync(current)) {
        const parent = dirname(current);
        if (parent === current) break;
        rest.unshift(current.slice(parent.length + 1));
        current = parent;
    }
    return join(realpathSync(current), ...rest);
}

export function insideRepo(path: string): boolean {
    const rel = relative(realOrSelf(REPO), realOrSelf(path));
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function runDir(root: string, evalName: string, label: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(label) || label === '.' || label === '..') throw new Error(`refused: label ${JSON.stringify(label)} must be letters, digits, dot, dash or underscore`);
    if (!/^[a-z0-9-]+$/.test(evalName)) throw new Error(`refused: eval name ${JSON.stringify(evalName)} must be lowercase letters, digits or dashes`);
    const dir = join(root, evalName, 'runs', label);
    if (insideRepo(dir)) throw new Error(`refused: ${dir} is inside the repository ${REPO}; runs live under $HOME/.local/state/tab-recap-evals/suite`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

export function readJsonl<T>(file: string): T[] {
    if (!existsSync(file)) return [];
    return readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as T);
}

export function appendJsonl(file: string, row: unknown): void {
    appendFileSync(file, `${JSON.stringify(row)}\n`);
}

export function lastByKey<T extends { readonly key: string }>(rows: readonly T[]): Map<string, T> {
    const found = new Map<string, T>();
    for (const row of rows) found.set(row.key, row);
    return found;
}

export const keyOf = (id: string, config: string, repetition: number): string => `${id}|${config}|${repetition}`;

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

export function rng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const other = Math.floor(random() * (index + 1));
        const held = copy[index] as T;
        copy[index] = copy[other] as T;
        copy[other] = held;
    }
    return copy;
}

export const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

export async function pool<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < items.length) {
            const item = items[next] as T;
            next += 1;
            await work(item);
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, () => worker()));
}

export interface Pause {
    until: number;
}

export async function callWithBackoff(ask: Adapter, call: Call, backoffMs: readonly number[], pause: Pause, log: (line: string) => void): Promise<{ readonly called: Called; readonly attempts: number }> {
    let attempts = 0;
    for (;;) {
        const wait = pause.until - Date.now();
        if (wait > 0) await sleep(wait);
        attempts += 1;
        const called = await ask(call);
        if (called.failure_kind !== 'rate_limit' || attempts > backoffMs.length) return { called, attempts };
        const delay = backoffMs[attempts - 1] ?? 0;
        log(`rate limit on ${call.model}: waiting ${delay} ms before attempt ${attempts + 1}`);
        pause.until = Math.max(pause.until, Date.now() + delay);
    }
}

export function selectedItems<I, E>(spec: EvalSpec<I, E>, options: RunOptions): readonly Item<I, E>[] {
    return options.itemLimit === null ? spec.items : spec.items.slice(0, options.itemLimit);
}

export function selectedConfigs<I, E>(spec: EvalSpec<I, E>, options: RunOptions): readonly Config[] {
    if (options.configs === null) return spec.configs;
    const unknown = options.configs.filter((name) => !spec.configs.some((config) => config.name === name));
    if (unknown.length > 0) throw new Error(`unknown configuration: ${unknown.join(', ')}`);
    return spec.configs.filter((config) => options.configs?.includes(config.name) === true);
}

export function writePrompt<I, E>(spec: EvalSpec<I, E>, items: readonly Item<I, E>[], dir: string): string {
    const prompts = items.map((item) => ({ id: item.id, prompt: spec.prompt(item) }));
    const systems = new Set(prompts.map((each) => each.prompt.system));
    const digest = sha256(prompts.map((each) => `${each.id}\n${each.prompt.system}\n${each.prompt.user}`).join('\n'));
    const first = prompts[0];
    const lines = [
        `# Prompt: ${spec.name}`,
        '',
        `- items: ${items.length}`,
        `- distinct system prompts: ${systems.size}`,
        `- prompt sha256 (all items): ${digest}`,
        '',
    ];
    if (first !== undefined) {
        lines.push(`## System prompt of item ${first.id}`, '', '~~~~text', first.prompt.system, '~~~~', '', `## User message of item ${first.id}`, '', '~~~~text', first.prompt.user, '~~~~', '');
    }
    writeFileSync(join(dir, 'prompt.md'), lines.join('\n'));
    return digest;
}

export async function runJobs<I, E>(spec: EvalSpec<I, E>, options: RunOptions, dir: string): Promise<{ readonly made: number; readonly capped: boolean }> {
    const file = join(dir, 'answers.jsonl');
    const rows = readJsonl<Answer>(file);
    const done = lastByKey(rows);
    let calls = rows.reduce((total, row) => total + row.attempts, 0);
    let made = 0;
    let capped = false;
    const items = selectedItems(spec, options);
    const configs = selectedConfigs(spec, options);
    const all = items.flatMap((item) => configs.flatMap((config) => Array.from({ length: options.repetitions }, (_unused, index) => ({ item, config, repetition: index + 1 }))));
    const jobs = shuffled(all, rng(options.seed)).filter((job) => {
        const prior = done.get(keyOf(job.item.id, job.config.name, job.repetition));
        return prior === undefined || (options.retryFailed && prior.failure_kind !== null && TRANSIENT.includes(prior.failure_kind));
    });
    options.log(`${spec.name}: ${all.length} calls planned, ${all.length - jobs.length} already recorded, ${jobs.length} to make`);
    const backends: readonly Backend[] = ['claude', 'codex'];
    await Promise.all(backends.map(async (backend) => {
        const pause: Pause = { until: 0 };
        const mine = jobs.filter((job) => job.config.backend === backend);
        await pool(mine, options.concurrency, async (job) => {
            if (calls >= options.maxCalls) {
                capped = true;
                return;
            }
            calls += 1;
            const prompt = spec.prompt(job.item);
            const call: Call = { system: prompt.system, user: prompt.user, model: job.config.model, effort: job.config.effort, timeoutMs: job.config.timeoutMs ?? DEFAULT_TIMEOUT_MS };
            const ask: Adapter = options.stub ? async () => stubCalled(spec.stub(job.item, job.config, job.repetition)) : options.adapters[backend];
            const { called, attempts } = await callWithBackoff(ask, call, options.stub ? [] : options.backoffMs, pause, options.log);
            calls += attempts - 1;
            made += 1;
            const answer: Answer = { ...called, key: keyOf(job.item.id, job.config.name, job.repetition), id: job.item.id, config: job.config.name, repetition: job.repetition, backend, model: job.config.model, effort: job.config.effort, attempts, at: new Date().toISOString() };
            appendJsonl(file, answer);
            if (called.failure_kind !== null) options.log(`${answer.key}: ${called.failure_kind} ${called.failure_detail ?? ''}`);
        });
    }));
    if (capped) options.log(`call cap ${options.maxCalls} reached; rerun with the same label and a higher --max-calls to continue`);
    return { made, capped };
}
