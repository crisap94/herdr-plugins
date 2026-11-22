import type { DecisionLedger, DecisionVerdict, LastDecisionRow, SkipGate } from '#src/ports/autocompact-records.ts';
import type { AutocompactMode, AutocompactPercent, Gate, GateBusy, GateSameness } from '#src/recap/domain/autocompact.ts';
import { flightDetail } from '#src/recap/domain/in-flight.ts';
import type { Flight } from '#src/recap/domain/in-flight.ts';
import type { ContinuationNote } from '#src/recap/domain/continuation-note.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { instant, type Duration, type Instant, type Milliseconds } from '#src/recap/domain/time.ts';

export const ACTIVE = new Set(['briefing', 'compacting', 'restoring']);
export const ASKED_FOR_MS = 5 * 60_000;

export interface BusyReads {
    readonly activity: LaneActivity;
    readonly decisions: Pick<DecisionLedger, 'unlinkedCompactSince' | 'unlinkedCompactAny'>;
}

export type LaneUse = 'active' | 'idle';
export type AutomaticUse = 'in-progress' | 'idle';

export interface LaneActivity {
    activeFor(tab: TabId, pane: PaneId): LaneUse;
    automaticInProgress(): AutomaticUse;
}

export interface LaneSignals {
    lastBreakAt(tab: TabId, pane: PaneId): Instant | null;
}

export interface LaneRecapReadiness {
    ensure(tab: TabId): Promise<void>;
}

export interface CompactionAsk {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly note: ContinuationNote | null;
    readonly origin: 'auto';
}

export type TimingEvent =
    | { readonly kind: 'session-skipped'; readonly pane: PaneId; readonly gate: SkipGate }
    | { readonly kind: 'safe-point-decided'; readonly pane: PaneId; readonly verdict: DecisionVerdict; readonly share: Count };

export type BusyDetail = 'this lane' | 'another lane';
export type Busy = { readonly kind: 'free' } | { readonly kind: 'busy'; readonly detail: BusyDetail };
export type Sameness = 'same' | 'changed';
export type Recheck = 'due' | 'not-due';
export type CeilingReach = 'at-ceiling' | 'below-ceiling';

export function busyOf(reads: BusyReads, asked: ReadonlyMap<PaneId, Instant>, tab: TabId, pane: PaneId, now: Instant): Busy {
    const since = asked.get(pane);
    const own = reads.activity.activeFor(tab, pane) === 'active' || (since !== undefined && now - since < ASKED_FOR_MS) || reads.decisions.unlinkedCompactSince(tab, pane, instant(now - ASKED_FOR_MS)) === 'unlinked';
    if (own) return { kind: 'busy', detail: 'this lane' };
    const other = reads.activity.automaticInProgress() === 'in-progress' || reads.decisions.unlinkedCompactAny(instant(now - ASKED_FOR_MS)) === 'unlinked';
    return other ? { kind: 'busy', detail: 'another lane' } : { kind: 'free' };
}

export const gateBusyOf = (busy: Busy): GateBusy => (busy.kind === 'busy' ? 'busy' : 'free');

export const gateSamenessOf = (sameness: Sameness, recheck: Recheck): GateSameness => (sameness === 'same' && recheck !== 'due' ? 'same' : 'changed');

export function unchangedOf(last: LastDecisionRow | null, startedAt: Instant, tokens: Count, mode: AutocompactMode): Sameness {
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
