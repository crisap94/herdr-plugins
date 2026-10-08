// Autocompact's policy: when it may act and where its decider lives. Pure parsers over config values; the gates and the verdict join them here.

export type AutocompactMode = 'off' | 'shadow' | 'on';

export interface AutocompactPolicy {
    readonly mode: AutocompactMode;
    /** the context share (percent) from which every safe moment compacts */
    readonly soft: number;
    /** the share (percent) at which the verdict is `compact` with no model call; above the soft limit */
    readonly ceiling: number;
    readonly cooldownMs: number;
    /** the kinds whose lanes are compacted; any other compactable kind is decided and recorded only */
    readonly kinds: readonly string[];
}

export const SOFT_DEFAULT = 40;
export const SOFT_MIN = 10;
export const SOFT_MAX = 95;
export const CEILING_DEFAULT = 80;
export const COOLDOWN_DEFAULT_MS = 10 * 60_000;
export const KINDS_DEFAULT: readonly string[] = ['claude'];

const MODES: readonly AutocompactMode[] = ['off', 'shadow', 'on'];

const word = (raw: string | undefined): string => (raw ?? '').trim().toLowerCase();

/** `TAB_RECAP_AUTOCOMPACT`: `off`, `shadow` or `on`; anything else is `shadow`. */
export const modeOf = (raw: string | undefined): AutocompactMode => MODES.find((mode) => mode === word(raw)) ?? 'shadow';

/** A whole percent in `[SOFT_MIN, SOFT_MAX]`, else null (`40` or `40%`). */
function percentOf(raw: string | undefined): number | null {
    const percent = Number(word(raw).replace(/%$/, ''));
    return word(raw) !== '' && Number.isInteger(percent) && percent >= SOFT_MIN && percent <= SOFT_MAX ? percent : null;
}

/** `TAB_RECAP_AUTOCOMPACT_AT`: 10–95, else 40. */
export const softOf = (raw: string | undefined): number => percentOf(raw) ?? SOFT_DEFAULT;

/** `TAB_RECAP_AUTOCOMPACT_CEILING`: 10–95, else 80; and above `soft` always — a ceiling that is not becomes `soft` + 10, at most 95. */
export function ceilingOf(raw: string | undefined, soft: number): number {
    const ceiling = percentOf(raw) ?? CEILING_DEFAULT;
    return ceiling > soft ? ceiling : Math.min(SOFT_MAX, soft + 10);
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
    const soft = softOf(get('TAB_RECAP_AUTOCOMPACT_AT'));
    return { mode: modeOf(get('TAB_RECAP_AUTOCOMPACT')), soft, ceiling: ceilingOf(get('TAB_RECAP_AUTOCOMPACT_CEILING'), soft), cooldownMs: cooldownOf(get('TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS')), kinds: kindsOf(get('TAB_RECAP_AUTOCOMPACT_KINDS')) };
}

/** Where the `jev` decider lives: any compatible pass-through URL, and the pinned model id (opaque to the plugin). */
export interface JevSettings {
    readonly url: string;
    readonly model: string;
}

export const JEV_URL_DEFAULT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL_DEFAULT = 'jev-1.13.0';

/** `TAB_RECAP_JEV_URL` (an http(s) URL) and `TAB_RECAP_JEV_MODEL`; blank or nonsense is the default. */
export function jevOf(get: (key: string) => string | undefined): JevSettings {
    const url = (get('TAB_RECAP_JEV_URL') ?? '').trim();
    const model = (get('TAB_RECAP_JEV_MODEL') ?? '').trim();
    return { url: /^https?:\/\/\S+$/.test(url) ? url : JEV_URL_DEFAULT, model: model === '' ? JEV_MODEL_DEFAULT : model };
}

/** Where a consideration stops: busy · in-flight · below-soft · cooldown stop it before a model is asked; `ceiling` is `compact` with no model; `ask` goes on. */
export type Gate = 'busy' | 'in-flight' | 'below-soft' | 'cooldown' | 'ceiling' | 'ask';

/** What the gates look at: all facts of the lane at this instant. */
export interface GateInput {
    readonly kind: string;
    readonly kinds: readonly string[];
    /** a compaction of the lane is in progress or requested */
    readonly busy: boolean;
    /** the count of work in flight, or `unknown` for a reader that cannot tell (it counts as in flight) */
    readonly inFlight: number | 'unknown';
    readonly share: number;
    readonly soft: number;
    readonly ceiling: number;
    readonly now: number;
    readonly lastBreakAt: number | null;
    readonly lastWaitAt: number | null;
    readonly cooldownMs: number;
}

/** The gates in order. A kind outside `kinds` is `recordOnly`: still asked and recorded, its verdict never requests. */
export function gateOf(input: GateInput): { readonly gate: Gate; readonly recordOnly: boolean } {
    const recordOnly = !input.kinds.includes(input.kind);
    const since = Math.max(input.lastBreakAt ?? -Infinity, input.lastWaitAt ?? -Infinity);
    const gate = ((): Gate => {
        if (input.busy) return 'busy';
        if (input.inFlight === 'unknown' || input.inFlight > 0) return 'in-flight';
        if (input.share < input.soft) return 'below-soft';
        if (input.now - since < input.cooldownMs) return 'cooldown';
        return input.share >= input.ceiling ? 'ceiling' : 'ask';
    })();
    return { gate, recordOnly };
}
