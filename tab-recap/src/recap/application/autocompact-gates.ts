import type { AutocompactRecords, LastDecision } from '#src/ports/autocompact-records.ts';
import type { CompactionView } from '#src/ports/compaction-records.ts';
import type { CompactionQueue } from '#src/ports/requests.ts';
import type { LaneClaims } from './lane-claims.ts';
import type { AutocompactMode, Gate } from '#src/recap/domain/autocompact.ts';
import { flightDetail } from '#src/recap/domain/in-flight.ts';
import type { Flight } from '#src/recap/domain/in-flight.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Duration, Instant, Milliseconds } from '#src/recap/domain/time.ts';

export const ACTIVE = new Set(['briefing', 'compacting', 'restoring']);
export const ASKED_FOR_MS = 5 * 60_000;

export interface BusyReads {
    readonly compactions: Pick<CompactionView, 'shownFor' | 'autoInProgress'>;
    readonly decisions: Pick<AutocompactRecords, 'unlinkedCompactSince' | 'unlinkedCompactAny'>;
    readonly claims: Pick<LaneClaims, 'has'>;
    readonly queue: CompactionQueue;
}

export type BusyDetail = 'this lane' | 'another lane';
export type Busy = { readonly kind: 'free' } | { readonly kind: 'busy'; readonly detail: BusyDetail };
export type Sameness = 'same' | 'changed';
export type Recheck = 'due' | 'not-due';
export type CeilingReach = 'at-ceiling' | 'below-ceiling';

export function busyOf(reads: BusyReads, asked: ReadonlyMap<PaneId, Instant>, tab: TabId, pane: PaneId, now: Instant): Busy {
    const since = asked.get(pane);
    const own = reads.compactions.shownFor(tab).some((record) => record.pane === pane && ACTIVE.has(record.stage)) || (since !== undefined && now - since < ASKED_FOR_MS) || reads.decisions.unlinkedCompactSince(tab, pane, now - ASKED_FOR_MS)
        || reads.claims.has(pane) || reads.queue.compactQueued(tab, pane);
    if (own) return { kind: 'busy', detail: 'this lane' };
    const other = reads.compactions.autoInProgress() || reads.decisions.unlinkedCompactAny(now - ASKED_FOR_MS);
    return other ? { kind: 'busy', detail: 'another lane' } : { kind: 'free' };
}

export function unchangedOf(last: LastDecision | null, startedAt: Instant, tokens: number, mode: AutocompactMode): Sameness {
    return last !== null && last.verdict !== 'unknown' && last.at >= startedAt && last.tokens === tokens && last.mode === mode ? 'same' : 'changed';
}

const WAITING: ReadonlySet<string> = new Set(['wait', 'undecided']);

export const recheckDue = (interval: Milliseconds | null, last: LastDecision | null, now: Instant): Recheck => interval !== null && last !== null && WAITING.has(last.verdict) && now - last.at >= interval ? 'due' : 'not-due';

export interface DetailFacts {
    readonly now: Instant;
    readonly minimum: number;
    readonly cooldownMs: Duration;
    readonly lastBreakAt: Instant | null;
    readonly lastDecisionAt: Instant | null;
    readonly busy: BusyDetail | null;
    readonly flight: Flight | null;
    readonly atCeiling: CeilingReach;
}

const cooldownText = (facts: DetailFacts): Text => must(parseText(`${Math.ceil((facts.cooldownMs - (facts.now - Math.max(facts.lastBreakAt ?? -Infinity, facts.lastDecisionAt ?? -Infinity))) / 1000)} s left`));

export function flightTextOf(flight: Flight, atCeiling: CeilingReach): Text | null {
    const detail = flightDetail(flight, atCeiling === 'at-ceiling');
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
