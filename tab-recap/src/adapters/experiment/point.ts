import type { HistoryFact } from '#src/ports/ledger.ts';
import type { ModelCatalogue } from '#src/ports/model-catalogue.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { autocompactState } from '#src/recap/application/autocompact-state.ts';
import type { AutocompactState } from '#src/recap/application/autocompact-state.ts';
import { contextOf, shareOf } from '#src/recap/domain/compaction.ts';
import { COOLDOWN_DEFAULT_MS, CEILING_DEFAULT, KINDS_DEFAULT, gateFrom, parseGatePercent } from '#src/recap/domain/autocompact.ts';
import { duration, instant } from '#src/recap/domain/time.ts';
import type { Gate } from '#src/recap/domain/autocompact.ts';
import { flightOf, flightReason, NOT_AWAITING, observedFrom, runningCount, unreadable } from '#src/recap/domain/in-flight.ts';
import { hindsightOf } from '#src/experiment/hindsight.ts';
import type { Hindsight } from '#src/experiment/hindsight.ts';
import { claudeWindowOf } from '../capability/context-window.ts';
import { extractClaudeOf } from '../transcripts/claude/rows.ts';
import { claudeInFlightOf } from '../transcripts/claude/in-flight.ts';
import { claudeObservedOf } from '../transcripts/claude/context.ts';
import { linesAfterOf, linesBeforeOf } from '../transcripts/slice.ts';
import type { ExperimentStore, FramePoint, StoredPoint } from './store.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';

const TAIL_BYTES = 256 * 1024;
const EXPERIMENT_MINIMUM = 40;
const RECENT_KEPT = 60_000;

export type InFlight = number | 'unknown';

export interface ShareReading {
    readonly tokens: number;
    readonly window: number;
    readonly share: number;
}

export interface GateReading {
    readonly inFlight: InFlight;
    readonly gate: Gate;
}

export interface Point extends StoredPoint {
    readonly stratum: Text;
    readonly share: number | null;
    readonly tokens: number | null;
    readonly window: number | null;
    readonly inFlight: InFlight;
    readonly lastBreakAt: number | null;
    readonly gate: Gate;
    readonly state: AutocompactState;
    readonly recent: readonly Entry[];
    readonly history: readonly HistoryFact[];
    readonly hindsight: Hindsight;
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

export function shareAt(source: Text, cursor: number, catalogue: ModelCatalogue): ShareReading | null {
    const observed = claudeObservedOf(linesBeforeOf(fsPathOf(source), countOf(cursor), countOf(TAIL_BYTES)));
    const use = observed === null ? null : contextOf({ observed, setting: null }, claudeWindowOf(catalogue));
    return use === null ? null : { tokens: use.tokens, window: use.window, share: shareOf(use) };
}

function gateAt(stored: StoredPoint, lines: readonly Text[], lastBreakAt: number | null, share: number): GateReading {
    const flight = claudeInFlightOf(lines, 'absent');
    const inFlight = flight.kind === 'in-flight' ? flight.count : 'unknown';
    const observed = flight.kind === 'in-flight' ? observedFrom(runningCount(countOf(flight.count)), flight.background, flightReason(textOf('running'))) : unreadable(flightReason(textOf('unreadable')));
    const gate = gateFrom({ kind: 'claude', kinds: KINDS_DEFAULT, shadowKinds: [], busy: 'free', flight: flightOf(observed, NOT_AWAITING), share: parseGatePercent(share), minimum: parseGatePercent(EXPERIMENT_MINIMUM), ceiling: parseGatePercent(CEILING_DEFAULT), now: instant(stored.at), lastBreakAt: lastBreakAt === null ? null : instant(lastBreakAt), lastDecisionAt: null, cooldownMs: duration(COOLDOWN_DEFAULT_MS), unchanged: 'changed' }).gate;
    return { inFlight, gate };
}

export function pointOf(store: ExperimentStore, catalogue: ModelCatalogue, stored: FramePoint, stratum: Text): Point | null {
    try {
        const lines = linesBeforeOf(fsPathOf(stored.source), countOf(stored.cursor), countOf(TAIL_BYTES));
        const recent = trimmed(extractClaudeOf(lines).entries);
        const history = store.factsAt(stored);
        const used = shareAt(stored.source, stored.cursor, catalogue);
        const lastBreakAt = store.lastBreakAt(stored.tab, stored.at);
        const after = extractClaudeOf(linesAfterOf(fsPathOf(stored.source), countOf(stored.cursor), countOf(TAIL_BYTES))).entries;
        const { blob: _blob, ...plain } = stored;
        return {
            ...plain, stratum, share: used?.share ?? null, tokens: used?.tokens ?? null, window: used?.window ?? null, lastBreakAt, ...gateAt(stored, lines, lastBreakAt, used?.share ?? 0),
            state: autocompactState(recent, history), recent, history, hindsight: hindsightOf(after),
        };
    } catch {
        return null;
    }
}
