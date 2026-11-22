import type { HistoryFact } from '#src/ports/ledger.ts';
import type { ModelCatalogue } from '#src/ports/model-catalogue.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { autocompactState } from '#src/recap/application/autocompact-state.ts';
import type { AutocompactState } from '#src/recap/application/autocompact-state.ts';
import { contextOf, shareOf } from '#src/recap/domain/compaction.ts';
import { COOLDOWN_DEFAULT_MS, CEILING_DEFAULT, KINDS_DEFAULT, gateOf } from '#src/recap/domain/autocompact.ts';
import type { Gate } from '#src/recap/domain/autocompact.ts';
import { flightOf, flightReason, NOT_AWAITING, observedFrom, runningCount, unreadable } from '#src/recap/domain/in-flight.ts';
import { hindsightOf } from '#src/experiment/hindsight.ts';
import type { Hindsight } from '#src/experiment/hindsight.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { Milliseconds } from '#src/recap/domain/time.ts';
import { parseProbability, type Probability } from '#src/recap/domain/probability.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { claudeWindowOf } from '../capability/context-window.ts';
import { extractClaudeOf } from '../transcripts/claude/rows.ts';
import { claudeInFlightOf } from '../transcripts/claude/in-flight.ts';
import { claudeObservedOf } from '../transcripts/claude/context.ts';
import { linesAfterOf, linesBeforeOf } from '../transcripts/slice.ts';
import type { ExperimentStoreAt, FramePoint, StoredPoint } from './store.ts';

const TAIL_BYTES = must(parseCount(256 * 1024));
const EXPERIMENT_MINIMUM = 40;
const RECENT_KEPT = 60_000;

export type InFlight = Count | 'unknown';

export interface PointAt extends StoredPoint {
    readonly stratum: Text;
    readonly share: Probability | null;
    readonly tokens: Count | null;
    readonly window: Count | null;
    readonly inFlight: InFlight;
    readonly lastBreakAt: Milliseconds | null;
    readonly gate: Gate;
    readonly state: AutocompactState;
    readonly recent: readonly Entry[];
    readonly history: readonly HistoryFact[];
    readonly hindsight: Hindsight;
}

export interface UsageAt {
    readonly tokens: Count;
    readonly window: Count;
    readonly share: Probability | null;
}

function trimmed(entries: readonly Entry[]): readonly Entry[] {
    let room = RECENT_KEPT;
    const kept: Entry[] = [];
    for (const entry of entries.toReversed()) {
        room -= entry.text.length;
        if (room < 0 && kept.length > 0) break;
        kept.push(entry);
    }
    return kept.toReversed();
}

export function usageAt(source: FsPath, cursor: Count, catalogue: ModelCatalogue): UsageAt | null {
    const observed = claudeObservedOf(linesBeforeOf(source, cursor, TAIL_BYTES));
    const use = observed === null ? null : contextOf({ observed, setting: null }, claudeWindowOf(catalogue));
    if (use === null) return null;
    const tokens = parseCount(use.tokens);
    const window = parseCount(use.window);
    if (tokens.kind !== 'ok' || window.kind !== 'ok') return null;
    return { tokens: tokens.value, window: window.value, share: parseProbability(shareOf(use)) };
}

export interface Gated {
    readonly inFlight: InFlight;
    readonly gate: Gate;
}

function gateAt(stored: StoredPoint, lines: readonly Text[], lastBreakAt: Milliseconds | null, share: Probability | null): Gated {
    const flight = claudeInFlightOf(lines, 'absent');
    const counted = flight.kind === 'in-flight' ? parseCount(flight.count) : null;
    const inFlight: InFlight = counted !== null && counted.kind === 'ok' ? counted.value : 'unknown';
    const observed = flight.kind === 'in-flight' ? observedFrom(runningCount(flight.count), flight.background, flightReason('running')) : unreadable(flightReason('unreadable'));
    const gate = gateOf({ kind: 'claude', kinds: KINDS_DEFAULT, shadowKinds: [], busy: false, flight: flightOf(observed, NOT_AWAITING), share: share ?? 0, minimum: EXPERIMENT_MINIMUM, ceiling: CEILING_DEFAULT, now: stored.at, lastBreakAt, lastDecisionAt: null, cooldownMs: COOLDOWN_DEFAULT_MS, unchanged: false }).gate;
    return { inFlight, gate };
}

export function pointAt(store: ExperimentStoreAt, catalogue: ModelCatalogue, stored: FramePoint, stratum: Text): PointAt | null {
    try {
        const lines = linesBeforeOf(stored.source, stored.cursor, TAIL_BYTES);
        const recent = trimmed(extractClaudeOf(lines).entries);
        const history = store.factsAt(stored);
        const used = usageAt(stored.source, stored.cursor, catalogue);
        const lastBreakAt = store.lastBreakAt(stored.tab, stored.at);
        const after = extractClaudeOf(linesAfterOf(stored.source, stored.cursor, TAIL_BYTES)).entries;
        const { blob: _blob, ...plain } = stored;
        return {
            ...plain, stratum, share: used?.share ?? null, tokens: used?.tokens ?? null, window: used?.window ?? null, lastBreakAt, ...gateAt(stored, lines, lastBreakAt, used?.share ?? null),
            state: autocompactState(recent, history), recent, history, hindsight: hindsightOf(after),
        };
    } catch {
        return null;
    }
}

export type { Point } from './legacy.ts';
export { pointOf, shareAt } from './legacy.ts';
