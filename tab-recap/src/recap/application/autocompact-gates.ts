import type { AutocompactRecords, LastDecision } from '#src/ports/autocompact-records.ts';
import type { CompactionView } from '#src/ports/compaction-records.ts';
import type { CompactionQueue } from '#src/ports/requests.ts';
import type { LaneClaims } from './lane-claims.ts';
import type { AutocompactMode, Gate } from '#src/recap/domain/autocompact.ts';
import { flightDetail } from '#src/recap/domain/in-flight.ts';
import type { Flight } from '#src/recap/domain/in-flight.ts';
import { must, type Result } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';

export const ACTIVE = new Set(['briefing', 'compacting', 'restoring']);
export const ASKED_FOR_MS = 5 * 60_000;

export interface BusyReads {
    readonly compactions: Pick<CompactionView, 'shownFor' | 'autoInProgress'>;
    readonly decisions: Pick<AutocompactRecords, 'unlinkedCompactSince' | 'unlinkedCompactAny'>;
    readonly claims: Pick<LaneClaims, 'has'>;
    readonly queue: CompactionQueue;
}

export function busyOf(reads: BusyReads, asked: ReadonlyMap<string, number>, tab: string, pane: string, now: number): { readonly busy: boolean; readonly detail: string | null } {
    const since = asked.get(pane);
    const own = reads.compactions.shownFor(tab).some((record) => record.pane === pane && ACTIVE.has(record.stage)) || (since !== undefined && now - since < ASKED_FOR_MS) || reads.decisions.unlinkedCompactSince(tab, pane, now - ASKED_FOR_MS)
        || reads.claims.has(pane) || reads.queue.compactQueued(tab, pane);
    if (own) return { busy: true, detail: 'this lane' };
    const other = reads.compactions.autoInProgress() || reads.decisions.unlinkedCompactAny(now - ASKED_FOR_MS);
    return other ? { busy: true, detail: 'another lane' } : { busy: false, detail: null };
}

export function unchangedOf(last: LastDecision | null, startedAt: number, tokens: number, mode: AutocompactMode): boolean {
    return last !== null && last.verdict !== 'unknown' && last.at >= startedAt && last.tokens === tokens && last.mode === mode;
}

const WAITING: ReadonlySet<string> = new Set(['wait', 'undecided']);

export const recheckDue = (interval: number | null, last: LastDecision | null, now: number): boolean => interval !== null && last !== null && WAITING.has(last.verdict) && now - last.at >= interval;

export interface DetailFacts {
    readonly now: number;
    readonly minimum: number;
    readonly cooldownMs: number;
    readonly lastBreakAt: number | null;
    readonly lastDecisionAt: number | null;
    readonly busy: string | null;
    readonly flight: Flight | null;
    readonly atCeiling: boolean;
}

const asText = (result: Result<Text, ParseFailure>): Text | null => (result.kind === 'ok' ? result.value : null);

export function detailOf(gate: Gate, facts: DetailFacts): Text | null {
    if (gate === 'busy') return facts.busy === null ? null : asText(parseText(facts.busy));
    if (gate === 'below-minimum') return asText(parseText(`below ${facts.minimum} %`));
    if (gate === 'cooldown') return asText(parseText(`${Math.ceil((facts.cooldownMs - (facts.now - Math.max(facts.lastBreakAt ?? -Infinity, facts.lastDecisionAt ?? -Infinity))) / 1000)} s left`));
    if (gate === 'unchanged') return must(parseText('same tokens and mode as the last decision'));
    if (gate === 'coverage-backoff') return must(parseText('recent brief check failed'));
    if (gate !== 'in-flight' || facts.flight === null) return null;
    const detail = flightDetail(facts.flight, facts.atCeiling);
    return detail === null ? null : asText(parseText(detail));
}
