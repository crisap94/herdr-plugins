// The facts the gates read beside the verdict's own: whether another lane's automatic compaction holds this one, whether anything changed since the
// lane's last decision, and the detail a skip keeps. Pure over what it is handed.
import type { AutocompactRecords, LastDecision } from '#src/ports/autocompact-records.ts';
import type { CompactionView } from '#src/ports/compaction-records.ts';
import type { AutocompactMode, Gate } from '#src/recap/domain/autocompact.ts';

export const ACTIVE = new Set(['briefing', 'compacting', 'restoring']);
/** A compaction asked for and not yet begun counts as in progress this long: longer than the worst gap (the recap wait, the queue poll). */
export const ASKED_FOR_MS = 5 * 60_000;

/** The work a lane's agent has in flight: a count, or `unknown` with the reason the reader gave (it counts as in flight). */
export interface FlightAnswer {
    readonly count: number | 'unknown';
    readonly why: string;
    /** the skip's detail when it is not the count's (an `awaiting` token names what the lane waits for) */
    readonly detail?: string;
}

export interface BusyReads {
    readonly compactions: Pick<CompactionView, 'shownFor' | 'autoInProgress'>;
    readonly decisions: Pick<AutocompactRecords, 'unlinkedCompactSince' | 'unlinkedCompactAny'>;
}

/** A compaction of this lane is in progress or was asked for (`this lane`); an automatic one of another lane is, or was asked for (`another lane`).
 * `asked` is this process's requests by pane. */
export function busyOf(reads: BusyReads, asked: ReadonlyMap<string, number>, tab: string, pane: string, now: number): { readonly busy: boolean; readonly detail: string | null } {
    const since = asked.get(pane);
    const own = reads.compactions.shownFor(tab).some((record) => record.pane === pane && ACTIVE.has(record.stage)) || (since !== undefined && now - since < ASKED_FOR_MS) || reads.decisions.unlinkedCompactSince(tab, pane, now - ASKED_FOR_MS);
    if (own) return { busy: true, detail: 'this lane' };
    const other = reads.compactions.autoInProgress() || reads.decisions.unlinkedCompactAny(now - ASKED_FOR_MS);
    return other ? { busy: true, detail: 'another lane' } : { busy: false, detail: null };
}

/** The same tokens and mode as the lane's last decision, made by this process, and not `unknown` (an unknown one is asked again): nothing changed since. */
export function unchangedOf(last: LastDecision | null, startedAt: number, tokens: number, mode: AutocompactMode): boolean {
    return last !== null && last.verdict !== 'unknown' && last.at >= startedAt && last.tokens === tokens && last.mode === mode;
}

/** The re-check: the style's interval has passed since the lane's last decision, so an unchanged lane is asked again (never when `interval` is null). */
export const recheckDue = (interval: number | null, lastDecisionAt: number | null, now: number): boolean => interval !== null && lastDecisionAt !== null && now - lastDecisionAt >= interval;

export interface DetailFacts {
    readonly now: number;
    readonly minimum: number;
    readonly cooldownMs: number;
    readonly lastBreakAt: number | null;
    readonly lastDecisionAt: number | null;
    /** the busy detail, when the lane is busy */
    readonly busy: string | null;
    readonly flight: FlightAnswer | null;
}

/** What a skip says about its gate, in a few words; null for the gates that decide. */
export function detailOf(gate: Gate, facts: DetailFacts): string | null {
    if (gate === 'busy') return facts.busy;
    if (gate === 'below-minimum') return `below ${facts.minimum} %`;
    if (gate === 'cooldown') return `${Math.ceil((facts.cooldownMs - (facts.now - Math.max(facts.lastBreakAt ?? -Infinity, facts.lastDecisionAt ?? -Infinity))) / 1000)} s left`;
    if (gate === 'unchanged') return 'same tokens and mode as the last decision';
    return gate === 'in-flight' && facts.flight !== null ? flightDetail(facts.flight) : null;
}

/** An `awaiting` token names what the lane waits for; otherwise the reader's count, or why it cannot tell. */
const flightDetail = (flight: FlightAnswer): string => flight.detail ?? (flight.count === 'unknown' ? flight.why : `${flight.count} running`);
