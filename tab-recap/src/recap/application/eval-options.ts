import { parseArgs } from 'node:util';
import { PIPELINES } from '#src/recap/domain/pipeline.ts';
import type { Pipeline } from '#src/recap/domain/pipeline.ts';

export { PIPELINES };
export type { Pipeline };

export interface EvalOptions {
    readonly mode: 'sample' | 'label' | 'agree' | 'gates' | 'replay';
    readonly count: number;
    readonly tab: string | null;
    readonly since: number | null;
    readonly json: boolean;
    readonly replay: string | null;
    readonly kind: string | null;
    readonly compareImported: string | null;
    readonly pipeline: Pipeline | null;
    readonly check: string | null;
}

const SECTIONS: ReadonlySet<string> = new Set(['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'rules']);

export const isItemCheck = (check: string): boolean => /^I[1-7]$/u.test(check) || (check.startsWith('S-') && SECTIONS.has(check.slice(2)));

export type ParsedEval = { readonly kind: 'options'; readonly options: EvalOptions } | { readonly kind: 'usage'; readonly why: string };

export const EVAL_USAGE = 'USAGE: tab-recap eval [--sample <n>] [--tab <id>] [--since <days>] [--json] | --label <n> [--check <I1…I7|S-section>] | --agree | --gates [--since <days>] | --replay <transcript-file> [--kind claude|codex] [--tab <label>] [--compare-imported <tab>] [--pipeline one|enumerate|enumerate+gates|full]';

export const DEFAULT_SAMPLE = 20;

function whole(raw: string | undefined, name: string): { readonly value: number | null; readonly bad: string | null } {
    const value = Number(raw);
    if (raw === undefined) {
        return { value: null, bad: null };
    }
    return Number.isInteger(value) && value > 0 ? { value, bad: null } : { value: null, bad: `--${name} takes a whole number above 0` };
}

const MODES = { label: 'label', agree: 'agree', gates: 'gates' } as const;

function valuesOf(argv: readonly string[]): ReturnType<typeof parseArgs>['values'] | string {
    try {
        return parseArgs({
            args: [...argv], allowPositionals: false, strict: true,
            options: { sample: { type: 'string' }, tab: { type: 'string' }, since: { type: 'string' }, label: { type: 'string' }, agree: { type: 'boolean' }, gates: { type: 'boolean' }, json: { type: 'boolean' }, replay: { type: 'string' }, kind: { type: 'string' }, 'compare-imported': { type: 'string' }, pipeline: { type: 'string' }, check: { type: 'string' } },
        }).values;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

const textOf = (values: ReturnType<typeof parseArgs>['values'], name: string): string | undefined => (typeof values[name] === 'string' ? values[name] : undefined);

type Moded = { readonly mode: EvalOptions['mode'] } | { readonly why: string };

function modeOf(values: ReturnType<typeof parseArgs>['values'], label: number | null, sample: number | null): Moded {
    const modes = [label !== null ? MODES.label : null, values['agree'] === true ? MODES.agree : null, values['gates'] === true ? MODES.gates : null].flatMap((mode) => mode ?? []);
    if (modes.length > 1 || (modes.length === 1 && sample !== null)) {
        return { why: '--label, --agree and --gates exclude each other and --sample' };
    }
    return { mode: modes[0] ?? 'sample' };
}

const optionsOf = (values: ReturnType<typeof parseArgs>['values'], mode: EvalOptions['mode'], counts: { readonly label: number | null; readonly sample: number | null; readonly since: number | null }): EvalOptions =>
    ({
        mode, count: counts.label ?? counts.sample ?? DEFAULT_SAMPLE, tab: textOf(values, 'tab') ?? null, since: counts.since, json: values['json'] === true,
        replay: textOf(values, 'replay') ?? null, kind: textOf(values, 'kind') ?? null, compareImported: textOf(values, 'compare-imported') ?? null,
        pipeline: PIPELINES.find((each) => each === textOf(values, 'pipeline')) ?? null, check: textOf(values, 'check') ?? null,
    });

function replayProblem(values: ReturnType<typeof parseArgs>['values']): string | null {
    const others = ['sample', 'label', 'since', 'agree', 'gates', 'json', 'check'].filter((name) => values[name] !== undefined);
    const pipeline = textOf(values, 'pipeline');
    if (pipeline !== undefined && !PIPELINES.some((each) => each === pipeline)) {
        return `--pipeline takes ${PIPELINES.join(', ')}`;
    }
    if (values['replay'] === undefined) {
        return values['kind'] === undefined && values['compare-imported'] === undefined && pipeline === undefined ? null : '--kind, --compare-imported and --pipeline go with --replay';
    }
    return others.length > 0 ? `--replay excludes --${others[0] ?? ''}` : null;
}

function checkProblem(check: string | undefined, label: number | null): string | undefined {
    if (check === undefined) {
        return undefined;
    }
    if (label === null) {
        return '--check goes with --label';
    }
    return isItemCheck(check) ? undefined : '--check takes I1…I7 or S-<section>, such as I5 or S-done';
}

export function parseEval(argv: readonly string[]): ParsedEval {
    const values = valuesOf(argv);
    if (typeof values === 'string') {
        return { kind: 'usage', why: values };
    }
    const replaying = replayProblem(values);
    if (replaying !== null) {
        return { kind: 'usage', why: replaying };
    }
    if (values['replay'] !== undefined) {
        return { kind: 'options', options: optionsOf(values, 'replay', { label: null, sample: null, since: null }) };
    }
    const [sample, label, since] = [whole(textOf(values, 'sample'), 'sample'), whole(textOf(values, 'label'), 'label'), whole(textOf(values, 'since'), 'since')];
    const problem = [sample, label, since].flatMap((found) => found.bad ?? []).at(0) ?? checkProblem(textOf(values, 'check'), label.value);
    const moded = modeOf(values, label.value, sample.value);
    if (problem !== undefined || 'why' in moded) {
        return { kind: 'usage', why: problem ?? ('why' in moded ? moded.why : '') };
    }
    return { kind: 'options', options: optionsOf(values, moded.mode, { label: label.value, sample: sample.value, since: since.value }) };
}
