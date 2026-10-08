// Autocompact's policy: when it may act and where its decider lives. Pure parsers over config values; the gates and the verdict join them here.

export type AutocompactMode = 'off' | 'shadow' | 'on';

export interface AutocompactPolicy {
    readonly mode: AutocompactMode;
    /** the context share (percent) from which every safe moment compacts */
    readonly minimum: number;
    /** the share (percent) at which the verdict is `compact` with no model call; above the minimum */
    readonly ceiling: number;
    readonly cooldownMs: number;
    /** the kinds whose lanes are compacted; any other compactable kind is decided and recorded only */
    readonly kinds: readonly string[];
}

export const MINIMUM_DEFAULT = 10;
export const MINIMUM_MIN = 10;
export const MINIMUM_MAX = 95;
export const CEILING_DEFAULT = 80;
export const COOLDOWN_DEFAULT_MS = 10 * 60_000;
export const KINDS_DEFAULT: readonly string[] = ['claude'];

const MODES: readonly AutocompactMode[] = ['off', 'shadow', 'on'];

const word = (raw: string | undefined): string => (raw ?? '').trim().toLowerCase();

/** `TAB_RECAP_AUTOCOMPACT`: `off`, `shadow` or `on`; anything else is `shadow`. */
export const modeOf = (raw: string | undefined): AutocompactMode => MODES.find((mode) => mode === word(raw)) ?? 'shadow';

/** A whole percent in `[MINIMUM_MIN, MINIMUM_MAX]`, else null (`40` or `40%`). */
function percentOf(raw: string | undefined): number | null {
    const percent = Number(word(raw).replace(/%$/, ''));
    return word(raw) !== '' && Number.isInteger(percent) && percent >= MINIMUM_MIN && percent <= MINIMUM_MAX ? percent : null;
}

/** `TAB_RECAP_AUTOCOMPACT_AT`: 10–95, else 40. */
export const minimumOf = (raw: string | undefined): number => percentOf(raw) ?? MINIMUM_DEFAULT;

/** `TAB_RECAP_AUTOCOMPACT_CEILING`: 10–95, else 80; and above `minimum` always — a ceiling that is not becomes `minimum` + 10, at most 95. */
export function ceilingOf(raw: string | undefined, minimum: number): number {
    const ceiling = percentOf(raw) ?? CEILING_DEFAULT;
    return ceiling > minimum ? ceiling : Math.min(MINIMUM_MAX, minimum + 10);
}

/** `TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS`: a whole number of milliseconds, 0 or more, else ten minutes. */
export function cooldownOf(raw: string | undefined): number {
    const ms = Number(word(raw));
    return word(raw) !== '' && Number.isInteger(ms) && ms >= 0 ? ms : COOLDOWN_DEFAULT_MS;
}

/** `TAB_RECAP_AUTOCOMPACT_KINDS`: a comma list of agent kinds, else `claude`. */
export function kindsOf(raw: string | undefined): readonly string[] {
    const kinds = [...new Set(word(raw).split(',').map((kind) => kind.trim()).filter((kind) => kind !== ''))];
    return kinds.length === 0 ? KINDS_DEFAULT : kinds;
}

/** The whole policy from the configuration. */
export function policyOf(get: (key: string) => string | undefined): AutocompactPolicy {
    const minimum = minimumOf(get('TAB_RECAP_AUTOCOMPACT_AT'));
    return { mode: modeOf(get('TAB_RECAP_AUTOCOMPACT')), minimum, ceiling: ceilingOf(get('TAB_RECAP_AUTOCOMPACT_CEILING'), minimum), cooldownMs: cooldownOf(get('TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS')), kinds: kindsOf(get('TAB_RECAP_AUTOCOMPACT_KINDS')) };
}

/** Who checks a brief's coverage: `auto` (Jev when a key is found, else the moment decider), `jev`, or `decider` (the moment decider). */
export type CoverageBy = 'auto' | 'jev' | 'decider';

export const COVERAGE_BY_DEFAULT: CoverageBy = 'auto';

const COVERAGE_BY: readonly CoverageBy[] = ['auto', 'jev', 'decider'];

/** `TAB_RECAP_AUTOCOMPACT_COVERAGE_BY`: `auto`, `jev` or `decider`; anything else is `auto`. */
export const coverageByOf = (raw: string | undefined): CoverageBy => COVERAGE_BY.find((by) => by === word(raw)) ?? COVERAGE_BY_DEFAULT;

/** Where the `jev` decider lives: any compatible pass-through URL, and the pinned model id (opaque to the plugin). */
export interface JevSettings {
    readonly url: string;
    readonly model: string;
}

export const JEV_URL_DEFAULT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL_DEFAULT = 'jev-1.13.0';

/** `https://` to any host, or `http://` only to a loopback address (the bearer key never travels in clear text off the machine). */
const SECURE_URL = /^https:\/\/[^\s/]+\S*$/;
const LOOPBACK_URL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/\S*)?$/;

/** `TAB_RECAP_JEV_URL` (an `https://` URL, or `http://` to a loopback address) and `TAB_RECAP_JEV_MODEL`; blank or nonsense is the default. */
export function jevOf(get: (key: string) => string | undefined): JevSettings {
    const url = (get('TAB_RECAP_JEV_URL') ?? '').trim();
    const model = (get('TAB_RECAP_JEV_MODEL') ?? '').trim();
    const usable = SECURE_URL.test(url) || LOOPBACK_URL.test(url);
    return { url: usable ? url : JEV_URL_DEFAULT, model: model === '' ? JEV_MODEL_DEFAULT : model };
}

/** Where a consideration stops: busy · in-flight · below-minimum · cooldown stop it before a model is asked; `ceiling` is `compact` with no model; `ask` goes on.
 * With `inFlight` null the in-flight gate is passed over: the answer is `ask` or `ceiling` only if the lane would otherwise be asked. */
export type Gate = 'busy' | 'in-flight' | 'below-minimum' | 'cooldown' | 'ceiling' | 'ask';

/** What the gates look at: all facts of the lane at this instant. */
export interface GateInput {
    readonly kind: string;
    readonly kinds: readonly string[];
    /** a compaction of the lane is in progress or requested */
    readonly busy: boolean;
    /** the count of work in flight, or `unknown` for a reader that cannot tell (it counts as in flight); null when it was not read: the gates before it decided, and the lane would be asked */
    readonly inFlight: number | 'unknown' | null;
    readonly share: number;
    readonly minimum: number;
    readonly ceiling: number;
    readonly now: number;
    readonly lastBreakAt: number | null;
    /** when the lane last got a decision of any verdict */
    readonly lastDecisionAt: number | null;
    readonly cooldownMs: number;
}

/** The gates in order. A kind outside `kinds` is `recordOnly`: still asked and recorded, its verdict never requests. */
export function gateOf(input: GateInput): { readonly gate: Gate; readonly recordOnly: boolean } {
    const recordOnly = !input.kinds.includes(input.kind);
    const since = Math.max(input.lastBreakAt ?? -Infinity, input.lastDecisionAt ?? -Infinity);
    const gate = ((): Gate => {
        if (input.busy) return 'busy';
        if (input.inFlight === 'unknown' || (input.inFlight !== null && input.inFlight > 0)) return 'in-flight';
        if (input.share < input.minimum) return 'below-minimum';
        if (input.now - since < input.cooldownMs) return 'cooldown';
        return input.share >= input.ceiling ? 'ceiling' : 'ask';
    })();
    return { gate, recordOnly };
}
