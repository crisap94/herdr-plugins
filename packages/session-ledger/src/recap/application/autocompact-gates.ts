import type { DecisionLedger, LastDecisionRow } from '#src/ports/autocompact-records.ts';
import type { WatchMode, AutocompactPercent, Gate, GateBusy, GateSameness } from '#src/recap/domain/autocompact.ts';
import { flightDetail, ceilingOf } from '#src/recap/domain/in-flight.ts';
import type { Flight } from '#src/recap/domain/in-flight.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { SessionKey, Placement } from '#src/recap/domain/timing-ids.ts';
import type { CompactionActivity } from '#src/compaction-timing/contract.ts';
import { instant, type Duration, type Instant, type Milliseconds } from '#src/recap/domain/time.ts';

export const ACTIVE = new Set(['briefing', 'compacting', 'restoring']);
export const ASKED_FOR_MS = 5 * 60_000;

export interface BusyReads {
    readonly activity: Pick<CompactionActivity, 'activeFor' | 'automaticInProgress'>;
    readonly decisions: Pick<DecisionLedger, 'unlinkedCompactSince' | 'unlinkedCompactAny'>;
}

export type BusyDetail = 'this lane' | 'another lane';
export type Busy = { readonly kind: 'free' } | { readonly kind: 'busy'; readonly detail: BusyDetail };
export type Sameness = 'same' | 'changed';
export type Recheck = 'due' | 'not-due';
export type CeilingReach = 'at-ceiling' | 'below-ceiling';

export function busyOf(reads: BusyReads, asked: ReadonlyMap<SessionKey, Instant>, placed: Placement, now: Instant): Busy {
    const { scope, key, candidate } = placed;
    const since = asked.get(key);
    const own = reads.activity.activeFor(candidate.scope, candidate.key) || (since !== undefined && now - since < ASKED_FOR_MS) || reads.decisions.unlinkedCompactSince(scope, key, instant(now - ASKED_FOR_MS)) === 'unlinked';
    if (own) return { kind: 'busy', detail: 'this lane' };
    const other = reads.activity.automaticInProgress() || reads.decisions.unlinkedCompactAny(instant(now - ASKED_FOR_MS)) === 'unlinked';
    return other ? { kind: 'busy', detail: 'another lane' } : { kind: 'free' };
}

export const gateBusyOf = (busy: Busy): GateBusy => (busy.kind === 'busy' ? 'busy' : 'free');

export const gateSamenessOf = (sameness: Sameness, recheck: Recheck): GateSameness => (sameness === 'same' && recheck !== 'due' ? 'same' : 'changed');

export function unchangedOf(last: LastDecisionRow | null, startedAt: Instant, tokens: Count, mode: WatchMode): Sameness {
    return last !== null && last.verdict !== 'unknown' && last.at >= startedAt && last.tokens === tokens && last.mode === mode ? 'same' : 'changed';
}

const WAITING: ReadonlySet<string> = new Set(['wait', 'undecided']);

export const recheckDue = (interval: Milliseconds | null, last: LastDecisionRow | null, now: Instant): Recheck => interval !== null && last !== null && WAITING.has(last.verdict) && now - last.at >= interval ? 'due' : 'not-due';

export interface DetailFacts {
    readonly now: Instant;
    readonly minimum: AutocompactPercent;
    readonly cooldownMs: Duration;
    readonly lastBreakAt: Instant | null;
    readonly lastDecisionAt: Instant | null;
    readonly busy: BusyDetail | null;
    readonly flight: Flight | null;
    readonly atCeiling: CeilingReach;
}

const cooldownText = (facts: DetailFacts): Text => must(parseText(`${Math.ceil((facts.cooldownMs - (facts.now - Math.max(facts.lastBreakAt ?? -Infinity, facts.lastDecisionAt ?? -Infinity))) / 1000)} s left`));

export function flightTextOf(flight: Flight, atCeiling: CeilingReach): Text | null {
    const detail = flightDetail(flight, ceilingOf(atCeiling === 'at-ceiling'));
    return detail === null ? null : must(parseText(detail));
}

function flightText(facts: DetailFacts): Text | null {
    return facts.flight === null ? null : flightTextOf(facts.flight, facts.atCeiling);
}

export function detailOf(gate: Gate, facts: DetailFacts): Text | null {
    if (gate === 'busy') return facts.busy === null ? null : must(parseText(facts.busy));
    if (gate === 'below-minimum') return must(parseText(`below ${facts.minimum} %`));
    if (gate === 'cooldown') return cooldownText(facts);
    if (gate === 'unchanged') return must(parseText('same tokens and mode as the last decision'));
    if (gate === 'coverage-backoff') return must(parseText('recent brief check failed'));
    return gate === 'in-flight' ? flightText(facts) : null;
}
