import { STYLE_NUMBERS, styleOf } from './autocompact-style.ts';
import { REGISTERED_KINDS, kindsWith, registeredKindOf } from './registered-kinds.ts';
import type { RegisteredKind, RegisteredKindTable } from './registered-kinds.ts';
import type { Brand } from './brand.ts';
import type { Section } from './fact.ts';

export type Milliseconds = Brand<number, 'Milliseconds'>;
export type CeilingPolicy = 'overrides-check' | 'blocked-by-check';
export type Backoff = { readonly kind: 'off' } | { readonly kind: 'window'; readonly ms: Milliseconds };
export type BriefRetention = { readonly kind: 'none' } | { readonly kind: 'days'; readonly value: number };
export type UncheckedReason = 'no-decider' | 'decider-cannot-answer' | 'no-brief';
export interface CheckedFact {
    readonly section: Section;
    readonly text: string;
    readonly why: string | null;
}

export type CoverageOutcome = { readonly kind: 'passed' } | { readonly kind: 'missed'; readonly facts: readonly CheckedFact[] } | { readonly kind: 'unchecked'; readonly reason: UncheckedReason };

export const ceilingPolicyOf = (raw: string | undefined): CeilingPolicy => raw?.trim().toLowerCase() === 'off' ? 'blocked-by-check' : 'overrides-check';
export const backoffOf = (raw: string | undefined): Backoff => {
    const ms = Number((raw ?? '').trim());
    if (ms === 0) return { kind: 'off' };
    if (Number.isInteger(ms) && ms >= 60_000 && ms <= 86_400_000) return { kind: 'window', ms: ms as Milliseconds };
    return { kind: 'off' };
};
export const briefRetentionOf = (raw: string | undefined): BriefRetention => {
    if (raw === undefined || raw.trim() === '') return { kind: 'days', value: 14 };
    const days = Number(raw.trim());
    if (!Number.isInteger(days) || days < 0 || days > 60) return { kind: 'days', value: 14 };
    if (days === 0) return { kind: 'none' };
    return { kind: 'days', value: days };
};
export const milliseconds = (value: number): Milliseconds => value as Milliseconds;
export function unreachable(value: never): never {
    throw new Error(`unexpected case: ${String(value)}`);
}

export type AutocompactMode = 'off' | 'shadow' | 'on';

export interface AutocompactPolicy {
    readonly mode: AutocompactMode;
    readonly minimum: number;
    readonly ceiling: number;
    readonly cooldownMs: number;
    readonly kinds: readonly string[];
    readonly shadowKinds: readonly RegisteredKind[];
    readonly ceilingPolicy: CeilingPolicy;
    readonly coverageBackoff: Backoff;
}

export const MINIMUM_DEFAULT = 10;
export const MINIMUM_MIN = 10;
export const MINIMUM_MAX = 95;
export const CEILING_DEFAULT = STYLE_NUMBERS.balanced.ceiling;
export const COOLDOWN_DEFAULT_MS = STYLE_NUMBERS.balanced.cooldownMs;
export function autocompactDefaultKinds<T extends RegisteredKindTable>(table: T): readonly (keyof T)[] {
    return kindsWith(table, 'autocompactDefault');
}

export const KINDS_DEFAULT = autocompactDefaultKinds(REGISTERED_KINDS);
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

export function shadowKindsOf(raw: string | undefined): readonly RegisteredKind[] {
    const kinds = (raw ?? '').split(',').map((kind) => registeredKindOf(word(kind))).filter((kind): kind is RegisteredKind => kind !== null && REGISTERED_KINDS[kind].hasTranscript);
    return [...new Set(kinds)];
}

export function policyOf(get: (key: string) => string | undefined): AutocompactPolicy {
    const numbers = STYLE_NUMBERS[styleOf(get('TAB_RECAP_AUTOCOMPACT_STYLE'))];
    const minimum = minimumOf(get('TAB_RECAP_AUTOCOMPACT_AT'));
    return {
        mode: modeOf(get('TAB_RECAP_AUTOCOMPACT')), minimum, ceiling: ceilingOf(get('TAB_RECAP_AUTOCOMPACT_CEILING'), minimum, numbers.ceiling),
        cooldownMs: cooldownWith(get('TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS'), numbers.cooldownMs), kinds: kindsOf(get('TAB_RECAP_AUTOCOMPACT_KINDS')), shadowKinds: shadowKindsOf(get('TAB_RECAP_AUTOCOMPACT_SHADOW_KINDS')),
        ceilingPolicy: ceilingPolicyOf(get('TAB_RECAP_AUTOCOMPACT_CEILING_OVERRIDES_CHECK')), coverageBackoff: backoffOf(get('TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS')),
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

export const SKIP_GATES = ['below-minimum', 'busy', 'in-flight', 'cooldown', 'unchanged', 'no-context', 'coverage-backoff'] as const;
export type SkipGate = (typeof SKIP_GATES)[number];
export type Gate = SkipGate | 'ceiling' | 'ask';

export interface GateInput {
    readonly kind: string;
    readonly kinds: readonly string[];
    readonly shadowKinds: readonly RegisteredKind[];
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
    readonly coverageBackoff?: boolean;
}

function backoffGate(input: GateInput): Gate | null {
    if (input.coverageBackoff && input.share < input.ceiling) return 'coverage-backoff';
    return null;
}

export function gateOf(input: GateInput): { readonly gate: Gate; readonly recordOnly: boolean } {
    const recordOnly = !input.kinds.includes(input.kind) || input.shadowKinds.some((kind) => kind === input.kind);
    const since = Math.max(input.lastBreakAt ?? -Infinity, input.lastDecisionAt ?? -Infinity);
    const gate = ((): Gate => {
        if (input.busy) return 'busy';
        if (input.share < input.minimum) return 'below-minimum';
        if (input.now - since < input.cooldownMs) return 'cooldown';
        if (input.unchanged) return 'unchanged';
        const backoff = backoffGate(input);
        if (backoff !== null) return backoff;
        if (input.inFlight === 'unknown' || (input.inFlight !== null && input.inFlight > 0)) return 'in-flight';
        return input.share >= input.ceiling ? 'ceiling' : 'ask';
    })();
    return { gate, recordOnly };
}
