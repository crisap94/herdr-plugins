import { STYLE_NUMBERS, styleOf } from './autocompact-style.ts';

export type AutocompactMode = 'off' | 'shadow' | 'on';

export interface AutocompactPolicy {
    readonly mode: AutocompactMode;
    readonly minimum: number;
    readonly ceiling: number;
    readonly cooldownMs: number;
    readonly kinds: readonly string[];
}

export const MINIMUM_DEFAULT = 10;
export const MINIMUM_MIN = 10;
export const MINIMUM_MAX = 95;
export const CEILING_DEFAULT = STYLE_NUMBERS.balanced.ceiling;
export const COOLDOWN_DEFAULT_MS = STYLE_NUMBERS.balanced.cooldownMs;
export const KINDS_DEFAULT: readonly string[] = ['claude'];
export const READY: ReadonlySet<string> = new Set(['idle', 'done']);

const MODES: readonly AutocompactMode[] = ['off', 'shadow', 'on'];

const word = (raw: string | undefined): string => (raw ?? '').trim().toLowerCase();

export const modeOf = (raw: string | undefined): AutocompactMode => MODES.find((mode) => mode === word(raw)) ?? 'shadow';

function percentOf(raw: string | undefined): number | null {
    const percent = Number(word(raw).replace(/%$/, ''));
    return word(raw) !== '' && Number.isInteger(percent) && percent >= MINIMUM_MIN && percent <= MINIMUM_MAX ? percent : null;
}

export const minimumOf = (raw: string | undefined): number => percentOf(raw) ?? MINIMUM_DEFAULT;

export function ceilingOf(raw: string | undefined, minimum: number, fallback: number = CEILING_DEFAULT): number {
    const ceiling = percentOf(raw) ?? fallback;
    return ceiling > minimum ? ceiling : Math.min(MINIMUM_MAX, minimum + 10);
}

export const cooldownOf = (raw: string | undefined): number => cooldownWith(raw, COOLDOWN_DEFAULT_MS);

export function cooldownWith(raw: string | undefined, fallback: number): number {
    const ms = Number(word(raw));
    return word(raw) !== '' && Number.isInteger(ms) && ms >= 0 ? ms : fallback;
}

export function kindsOf(raw: string | undefined): readonly string[] {
    const kinds = [...new Set(word(raw).split(',').map((kind) => kind.trim()).filter((kind) => kind !== ''))];
    return kinds.length === 0 ? KINDS_DEFAULT : kinds;
}

export function policyOf(get: (key: string) => string | undefined): AutocompactPolicy {
    const numbers = STYLE_NUMBERS[styleOf(get('TAB_RECAP_AUTOCOMPACT_STYLE'))];
    const minimum = minimumOf(get('TAB_RECAP_AUTOCOMPACT_AT'));
    return {
        mode: modeOf(get('TAB_RECAP_AUTOCOMPACT')), minimum, ceiling: ceilingOf(get('TAB_RECAP_AUTOCOMPACT_CEILING'), minimum, numbers.ceiling),
        cooldownMs: cooldownWith(get('TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS'), numbers.cooldownMs), kinds: kindsOf(get('TAB_RECAP_AUTOCOMPACT_KINDS')),
    };
}

export type CoverageBy = 'auto' | 'jev' | 'decider';

export const COVERAGE_BY_DEFAULT: CoverageBy = 'auto';

const COVERAGE_BY: readonly CoverageBy[] = ['auto', 'jev', 'decider'];

export const coverageByOf = (raw: string | undefined): CoverageBy => COVERAGE_BY.find((by) => by === word(raw)) ?? COVERAGE_BY_DEFAULT;

export interface JevSettings {
    readonly url: string;
    readonly model: string;
}

export const JEV_URL_DEFAULT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL_DEFAULT = 'jev-1.13.0';

const SECURE_URL = /^https:\/\/[^\s/]+\S*$/;
const LOOPBACK_URL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/\S*)?$/;

export function jevOf(get: (key: string) => string | undefined): JevSettings {
    const url = (get('TAB_RECAP_JEV_URL') ?? '').trim();
    const model = (get('TAB_RECAP_JEV_MODEL') ?? '').trim();
    const usable = SECURE_URL.test(url) || LOOPBACK_URL.test(url);
    return { url: usable ? url : JEV_URL_DEFAULT, model: model === '' ? JEV_MODEL_DEFAULT : model };
}

export type Gate = 'busy' | 'below-minimum' | 'cooldown' | 'unchanged' | 'in-flight' | 'ceiling' | 'ask';

export interface GateInput {
    readonly kind: string;
    readonly kinds: readonly string[];
    readonly busy: boolean;
    readonly inFlight: number | 'unknown' | null;
    readonly share: number;
    readonly minimum: number;
    readonly ceiling: number;
    readonly now: number;
    readonly lastBreakAt: number | null;
    readonly lastDecisionAt: number | null;
    readonly cooldownMs: number;
    readonly unchanged: boolean;
}

export function gateOf(input: GateInput): { readonly gate: Gate; readonly recordOnly: boolean } {
    const recordOnly = !input.kinds.includes(input.kind);
    const since = Math.max(input.lastBreakAt ?? -Infinity, input.lastDecisionAt ?? -Infinity);
    const gate = ((): Gate => {
        if (input.busy) return 'busy';
        if (input.share < input.minimum) return 'below-minimum';
        if (input.now - since < input.cooldownMs) return 'cooldown';
        if (input.unchanged) return 'unchanged';
        if (input.inFlight === 'unknown' || (input.inFlight !== null && input.inFlight > 0)) return 'in-flight';
        return input.share >= input.ceiling ? 'ceiling' : 'ask';
    })();
    return { gate, recordOnly };
}
