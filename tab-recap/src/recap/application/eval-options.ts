// The options of `tab-recap eval`, read with util.parseArgs. A usage error is a value.
import { parseArgs } from 'node:util';

export interface EvalOptions {
    readonly mode: 'sample' | 'label' | 'agree' | 'gates';
    /** runs to judge (`sample`) or items to label (`label`) */
    readonly count: number;
    readonly tab: string | null;
    /** only runs of the last this many days */
    readonly since: number | null;
    readonly json: boolean;
}

export type ParsedEval = { readonly kind: 'options'; readonly options: EvalOptions } | { readonly kind: 'usage'; readonly why: string };

export const EVAL_USAGE = 'USAGE: tab-recap eval [--sample <n>] [--tab <id>] [--since <days>] [--json] | --label <n> | --agree | --gates [--since <days>]';

export const DEFAULT_SAMPLE = 20;

/** A positive whole number, `null` when the option is absent; `bad` says what is wrong when it is not. */
function whole(raw: string | undefined, name: string): { readonly value: number | null; readonly bad: string | null } {
    const value = Number(raw);
    if (raw === undefined) {
        return { value: null, bad: null };
    }
    return Number.isInteger(value) && value > 0 ? { value, bad: null } : { value: null, bad: `--${name} takes a whole number above 0` };
}

const MODES = { label: 'label', agree: 'agree', gates: 'gates' } as const;

/** The options as strings and flags; a usage error is a value. */
function valuesOf(argv: readonly string[]): ReturnType<typeof parseArgs>['values'] | string {
    try {
        return parseArgs({
            args: [...argv], allowPositionals: false, strict: true,
            options: { sample: { type: 'string' }, tab: { type: 'string' }, since: { type: 'string' }, label: { type: 'string' }, agree: { type: 'boolean' }, gates: { type: 'boolean' }, json: { type: 'boolean' } },
        }).values;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

const textOf = (values: ReturnType<typeof parseArgs>['values'], name: string): string | undefined => (typeof values[name] === 'string' ? values[name] : undefined);

type Moded = { readonly mode: EvalOptions['mode'] } | { readonly why: string };

/** The one mode asked for (the sample when none), or what is wrong with asking for several. */
function modeOf(values: ReturnType<typeof parseArgs>['values'], label: number | null, sample: number | null): Moded {
    const modes = [label !== null ? MODES.label : null, values['agree'] === true ? MODES.agree : null, values['gates'] === true ? MODES.gates : null].flatMap((mode) => mode ?? []);
    if (modes.length > 1 || (modes.length === 1 && sample !== null)) {
        return { why: '--label, --agree and --gates exclude each other and --sample' };
    }
    return { mode: modes[0] ?? 'sample' };
}

const optionsOf = (values: ReturnType<typeof parseArgs>['values'], mode: EvalOptions['mode'], counts: { readonly label: number | null; readonly sample: number | null; readonly since: number | null }): EvalOptions =>
    ({ mode, count: counts.label ?? counts.sample ?? DEFAULT_SAMPLE, tab: textOf(values, 'tab') ?? null, since: counts.since, json: values['json'] === true });

export function parseEval(argv: readonly string[]): ParsedEval {
    const values = valuesOf(argv);
    if (typeof values === 'string') {
        return { kind: 'usage', why: values };
    }
    const [sample, label, since] = [whole(textOf(values, 'sample'), 'sample'), whole(textOf(values, 'label'), 'label'), whole(textOf(values, 'since'), 'since')];
    const problem = [sample, label, since].flatMap((found) => found.bad ?? []).at(0);
    const moded = modeOf(values, label.value, sample.value);
    if (problem !== undefined || 'why' in moded) {
        return { kind: 'usage', why: problem ?? ('why' in moded ? moded.why : '') };
    }
    return { kind: 'options', options: optionsOf(values, moded.mode, { label: label.value, sample: sample.value, since: since.value }) };
}
