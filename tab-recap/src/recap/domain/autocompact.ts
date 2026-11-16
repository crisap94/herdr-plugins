import { STYLE_NUMBERS, styleOf } from './autocompact-style.ts';
import { REGISTERED_KINDS, kindsWith, registeredKindOf } from './registered-kinds.ts';
import type { RegisteredKind, RegisteredKindTable } from './registered-kinds.ts';
import { brand, type Brand } from './brand.ts';
import { isSection, type Section } from './fact.ts';
import { holdsLane } from './in-flight.ts';
import type { Flight } from './in-flight.ts';
import type { Milliseconds } from './time.ts';
import type { Text } from './text.ts';

export type CeilingPolicy = 'overrides-check' | 'blocked-by-check';
export type Backoff = { readonly kind: 'off' } | { readonly kind: 'window'; readonly ms: Milliseconds };
export type RetentionDays = Brand<number, 'RetentionDays'>;
export type BriefRetention = { readonly kind: 'none' } | { readonly kind: 'days'; readonly value: RetentionDays };
export const MISSED_FACTS = ['append', 'wait'] as const;
export type MissedFacts = (typeof MISSED_FACTS)[number];
export const MISSED_FACTS_DEFAULT: MissedFacts = 'append';
export type UncheckedReason = 'no-decider' | 'decider-cannot-answer' | 'no-brief';
export interface CheckedFact {
    readonly section: Section;
    readonly text: Text;
    readonly why: Text | null;
}

const isTextOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string';

export function parseCheckedFact(raw: unknown): CheckedFact | null {
    if (typeof raw !== 'object' || raw === null || !('section' in raw) || !('text' in raw) || !('why' in raw)) return null;
    const { section, text, why } = raw;
    if (!isSection(section) || typeof text !== 'string' || !isTextOrNull(why)) return null;
    return { section, text: brand<string, 'Text'>(text), why: why === null ? null : brand<string, 'Text'>(why) };
}

export type CoverageOutcome = { readonly kind: 'passed' } | { readonly kind: 'missed'; readonly facts: readonly CheckedFact[] } | { readonly kind: 'unchecked'; readonly reason: UncheckedReason };

export const parseCeilingPolicy = (raw: unknown): CeilingPolicy => typeof raw === 'string' && raw.trim().toLowerCase() === 'off' ? 'blocked-by-check' : 'overrides-check';
export const parseBackoff = (raw: unknown): Backoff => {
    const ms = Number(typeof raw === 'string' ? raw.trim() : '');
    if (ms === 0) return { kind: 'off' };
    if (Number.isInteger(ms) && ms >= 60_000 && ms <= 86_400_000) return { kind: 'window', ms: brand<number, 'Milliseconds'>(ms) };
    return { kind: 'off' };
};
export const parseBriefRetention = (raw: unknown): BriefRetention => {
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (text === '') return { kind: 'days', value: brand<number, 'RetentionDays'>(14) };
    const days = Number(text);
    if (!Number.isInteger(days) || days < 0 || days > 60) return { kind: 'days', value: brand<number, 'RetentionDays'>(14) };
    if (days === 0) return { kind: 'none' };
    return { kind: 'days', value: brand<number, 'RetentionDays'>(days) };
};
export const parseMissedFacts = (raw: unknown): MissedFacts => {
    const word = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return MISSED_FACTS.find((each) => each === word) ?? MISSED_FACTS_DEFAULT;
};
export function unreachable(value: never): never {
    throw new Error(`unexpected case: ${String(value)}`);
}

export type AutocompactMode = 'off' | 'shadow' | 'on';

export type AutocompactPercent = Brand<number, 'AutocompactPercent'>;

export interface AutocompactPolicy {
    readonly mode: AutocompactMode;
    readonly minimum: AutocompactPercent;
    readonly ceiling: AutocompactPercent;
    readonly cooldownMs: Milliseconds;
    readonly kinds: readonly string[];
    readonly shadowKinds: readonly RegisteredKind[];
    readonly ceilingPolicy: CeilingPolicy;
    readonly coverageBackoff: Backoff;
    readonly missedFacts: MissedFacts;
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

const MODES: readonly AutocompactMode[] = ['off', 'shadow', 'on'];

const word = (raw: string | undefined): string => (raw ?? '').trim().toLowerCase();

export const modeOf = (raw: string | undefined): AutocompactMode => MODES.find((mode) => mode === word(raw)) ?? 'shadow';

export function parseAutocompactPercent(raw: unknown, fallback: number): AutocompactPercent {
    const text = typeof raw === 'number' ? String(raw) : word(typeof raw === 'string' ? raw : undefined);
    const percent = Number(text.replace(/%$/, ''));
    return brand<number, 'AutocompactPercent'>(text !== '' && Number.isInteger(percent) && percent >= MINIMUM_MIN && percent <= MINIMUM_MAX ? percent : fallback);
}

export const minimumOf = (raw: unknown): AutocompactPercent => parseAutocompactPercent(raw, MINIMUM_DEFAULT);

export function ceilingOf(raw: unknown, minimum: number, fallback: number = CEILING_DEFAULT): AutocompactPercent {
    const ceiling = parseAutocompactPercent(raw, fallback);
    return ceiling > minimum ? ceiling : parseAutocompactPercent(Math.min(MINIMUM_MAX, minimum + 10), MINIMUM_MIN);
}

export const cooldownOf = (raw: unknown): Milliseconds => parseCooldown(raw, COOLDOWN_DEFAULT_MS);

export function parseCooldown(raw: unknown, fallback: number): Milliseconds {
    const text = typeof raw === 'string' ? word(raw) : '';
    const ms = Number(text);
    return brand<number, 'Milliseconds'>(text !== '' && Number.isInteger(ms) && ms >= 0 ? ms : fallback);
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
        cooldownMs: parseCooldown(get('TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS'), numbers.cooldownMs), kinds: kindsOf(get('TAB_RECAP_AUTOCOMPACT_KINDS')), shadowKinds: shadowKindsOf(get('TAB_RECAP_AUTOCOMPACT_SHADOW_KINDS')),
        ceilingPolicy: parseCeilingPolicy(get('TAB_RECAP_AUTOCOMPACT_CEILING_OVERRIDES_CHECK')), coverageBackoff: parseBackoff(get('TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS')),
        missedFacts: parseMissedFacts(get('TAB_RECAP_AUTOCOMPACT_MISSED_FACTS')),
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

export const LANE_STATUSES = ['idle', 'done', 'working'] as const;
export type LaneStatusAtDecision = (typeof LANE_STATUSES)[number];

export function laneStatusAtDecision(raw: string | null | undefined): LaneStatusAtDecision | null {
    return LANE_STATUSES.find((status) => status === raw) ?? null;
}

export const SKIP_GATES = ['below-minimum', 'busy', 'in-flight', 'cooldown', 'unchanged', 'no-context', 'coverage-backoff'] as const;
export type SkipGate = (typeof SKIP_GATES)[number];
export type Gate = SkipGate | 'ceiling' | 'ask';

export interface GateInput {
    readonly kind: string;
    readonly kinds: readonly string[];
    readonly shadowKinds: readonly RegisteredKind[];
    readonly busy: boolean;
    readonly flight: Flight | null;
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

interface GateDecision {
    readonly gate: Gate;
    readonly recordOnly: boolean;
}

export function gateOf(input: GateInput): GateDecision {
    const recordOnly = !input.kinds.includes(input.kind) || input.shadowKinds.some((kind) => kind === input.kind);
    const since = Math.max(input.lastBreakAt ?? -Infinity, input.lastDecisionAt ?? -Infinity);
    const gate = ((): Gate => {
        if (input.busy) return 'busy';
        if (input.share < input.minimum) return 'below-minimum';
        if (input.now - since < input.cooldownMs) return 'cooldown';
        if (input.unchanged) return 'unchanged';
        const backoff = backoffGate(input);
        if (backoff !== null) return backoff;
        if (input.flight !== null && holdsLane(input.flight, input.share >= input.ceiling)) return 'in-flight';
        return input.share >= input.ceiling ? 'ceiling' : 'ask';
    })();
    return { gate, recordOnly };
}
