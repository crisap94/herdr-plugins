import { parseArgs } from 'node:util';
import { must } from '#src/protocol/result.ts';
import { parsePositiveCount, type PositiveCount } from '#src/recap/domain/count.ts';
import { PIPELINES, type Pipeline } from '#src/recap/domain/pipeline.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export type EvalMode = 'sample' | 'label' | 'agree' | 'gates' | 'replay';

export interface EvalRequest {
    readonly mode: EvalMode;
    readonly count: PositiveCount;
    readonly tab: Text | null;
    readonly since: PositiveCount | null;
    readonly json: Presence;
    readonly replay: Text | null;
    readonly kind: Text | null;
    readonly compareImported: Text | null;
    readonly pipeline: Pipeline | null;
    readonly mergeTurns?: PositiveCount;
    readonly check: Text | null;
    readonly prune: Presence;
}

export type ParsedEvalRequest = { readonly kind: 'options'; readonly options: EvalRequest } | { readonly kind: 'usage'; readonly why: Text };

export const DEFAULT_SAMPLE = 20;

const DEFAULT_COUNT = must(parsePositiveCount(DEFAULT_SAMPLE));

export const EVAL_USAGE = 'USAGE: tab-recap eval [--sample <n>] [--tab <id>] [--since <days>] [--json] | --label <n> [--check <I1…I7|S-section>] | --agree | --gates [--since <days>] | --replay <transcript-file> [--kind claude|codex] [--tab <label>] [--compare-imported <tab>] [--pipeline one|enumerate|enumerate+gates|full] [--merge-turns <n>] [--prune]';

const SECTIONS = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'rules'] as const;

const REPLAY_EXCLUSIVE: readonly OptionName[] = ['sample', 'label', 'since', 'agree', 'gates', 'json', 'check'];

const REPLAY_ONLY: readonly OptionName[] = ['kind', 'compare-imported', 'pipeline', 'prune', 'merge-turns'];

const OPTION_NAMES: readonly OptionName[] = ['sample', 'tab', 'since', 'label', 'agree', 'gates', 'json', 'replay', 'kind', 'compare-imported', 'pipeline', 'merge-turns', 'check', 'prune'];

export type OptionName = 'sample' | 'tab' | 'since' | 'label' | 'agree' | 'gates' | 'json' | 'replay' | 'kind' | 'compare-imported' | 'pipeline' | 'merge-turns' | 'check' | 'prune';

export interface Values {
    readonly texts: ReadonlyMap<OptionName, Text>;
    readonly flags: ReadonlySet<OptionName>;
}

type ValuesOutcome = { readonly kind: 'values'; readonly values: Values } | { readonly kind: 'usage'; readonly why: Text };

interface WholeNumber { readonly value: PositiveCount | null; readonly bad: Text | null }

interface OptionCounts { readonly label: PositiveCount | null; readonly sample: PositiveCount | null; readonly since: PositiveCount | null }

type Moded = { readonly mode: EvalMode } | { readonly why: Text };

export const isEvalItemCheck = (check: Text): Presence => (/^I[1-7]$/u.test(check) || SECTIONS.some((name) => check === `S-${name}`) ? 'present' : 'absent');

const flagged = (values: Values, name: OptionName): Presence => (values.flags.has(name) ? 'present' : 'absent');

const isSet = (values: Values, name: OptionName): Presence => (values.texts.has(name) || values.flags.has(name) ? 'present' : 'absent');

function valuesOf(argv: readonly Text[]): ValuesOutcome {
    try {
        const { values } = parseArgs({
            args: [...argv], allowPositionals: false, strict: true,
            options: { sample: { type: 'string' }, tab: { type: 'string' }, since: { type: 'string' }, label: { type: 'string' }, agree: { type: 'boolean' }, gates: { type: 'boolean' }, json: { type: 'boolean' }, replay: { type: 'string' }, kind: { type: 'string' }, 'compare-imported': { type: 'string' }, pipeline: { type: 'string' }, 'merge-turns': { type: 'string' }, check: { type: 'string' }, prune: { type: 'boolean' } },
        });
        return {
            kind: 'values',
            values: {
                texts: new Map(OPTION_NAMES.flatMap((name): readonly (readonly [OptionName, Text])[] => {
                    const value = values[name];
                    return typeof value === 'string' ? [[name, must(parseText(value))]] : [];
                })),
                flags: new Set(OPTION_NAMES.filter((name) => values[name] === true)),
            },
        };
    } catch (error) {
        return { kind: 'usage', why: must(parseText(error instanceof Error ? error.message : String(error))) };
    }
}

function whole(raw: Text | undefined, name: OptionName): WholeNumber {
    if (raw === undefined) {
        return { value: null, bad: null };
    }
    const parsed = parsePositiveCount(Number(raw));
    return parsed.kind === 'ok' ? { value: parsed.value, bad: null } : { value: null, bad: must(parseText(`--${name} takes a whole number above 0`)) };
}

function mergeTurnsOf(values: Values, mode: EvalMode): Pick<EvalRequest, 'mergeTurns'> {
    if (mode !== 'replay') {
        return {};
    }
    const parsed = parsePositiveCount(Number(values.texts.get('merge-turns') ?? 1));
    return parsed.kind === 'ok' ? { mergeTurns: parsed.value } : {};
}

function modeOf(values: Values, label: PositiveCount | null, sample: PositiveCount | null): Moded {
    const modes: EvalMode[] = [];
    if (label !== null) modes.push('label');
    if (flagged(values, 'agree') === 'present') modes.push('agree');
    if (flagged(values, 'gates') === 'present') modes.push('gates');
    if (modes.length > 1 || (modes.length === 1 && sample !== null)) {
        return { why: must(parseText('--label, --agree and --gates exclude each other and --sample')) };
    }
    return { mode: modes[0] ?? 'sample' };
}

function optionsOf(values: Values, mode: EvalMode, counts: OptionCounts): EvalRequest {
    const pipeline: string | undefined = values.texts.get('pipeline');
    return {
        mode, count: counts.label ?? counts.sample ?? DEFAULT_COUNT, tab: values.texts.get('tab') ?? null, since: counts.since,
        json: flagged(values, 'json'), replay: values.texts.get('replay') ?? null, kind: values.texts.get('kind') ?? null,
        compareImported: values.texts.get('compare-imported') ?? null, pipeline: PIPELINES.find((each) => each === pipeline) ?? null,
        ...mergeTurnsOf(values, mode), check: values.texts.get('check') ?? null, prune: flagged(values, 'prune'),
    };
}

function replayProblem(values: Values): Text | null {
    const pipeline: string | undefined = values.texts.get('pipeline');
    if (pipeline !== undefined && !PIPELINES.some((each) => each === pipeline)) {
        return must(parseText(`--pipeline takes ${PIPELINES.join(', ')}`));
    }
    if (isSet(values, 'replay') === 'absent') {
        return REPLAY_ONLY.some((name) => isSet(values, name) === 'present') ? must(parseText('--kind, --compare-imported, --pipeline, --prune and --merge-turns go with --replay')) : null;
    }
    const mergeTurns = whole(values.texts.get('merge-turns'), 'merge-turns');
    if (mergeTurns.bad !== null) {
        return mergeTurns.bad;
    }
    const other = REPLAY_EXCLUSIVE.find((name) => isSet(values, name) === 'present');
    return other === undefined ? null : must(parseText(`--replay excludes --${other}`));
}

function checkProblem(check: Text | undefined, label: PositiveCount | null): Text | undefined {
    if (check === undefined) {
        return undefined;
    }
    if (label === null) {
        return must(parseText('--check goes with --label'));
    }
    return isEvalItemCheck(check) === 'present' ? undefined : must(parseText('--check takes I1…I7 or S-<section>, such as I5 or S-done'));
}

export function parseEvalRequest(argv: readonly Text[]): ParsedEvalRequest {
    const outcome = valuesOf(argv);
    if (outcome.kind === 'usage') {
        return { kind: 'usage', why: outcome.why };
    }
    const { values } = outcome;
    const replaying = replayProblem(values);
    if (replaying !== null) {
        return { kind: 'usage', why: replaying };
    }
    if (isSet(values, 'replay') === 'present') {
        return { kind: 'options', options: optionsOf(values, 'replay', { label: null, sample: null, since: null }) };
    }
    const sample = whole(values.texts.get('sample'), 'sample');
    const label = whole(values.texts.get('label'), 'label');
    const since = whole(values.texts.get('since'), 'since');
    const problem = [sample, label, since].find((found) => found.bad !== null)?.bad ?? checkProblem(values.texts.get('check'), label.value);
    if (problem !== undefined) {
        return { kind: 'usage', why: problem };
    }
    const moded = modeOf(values, label.value, sample.value);
    if ('why' in moded) {
        return { kind: 'usage', why: moded.why };
    }
    return { kind: 'options', options: optionsOf(values, moded.mode, { label: label.value, sample: sample.value, since: since.value }) };
}
