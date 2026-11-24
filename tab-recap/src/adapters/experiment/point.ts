import type { HistoryFact } from '@stateforge-labs/session-ledger';
import type { ModelWindows } from '#src/ports/model-catalogue.ts';
import type { Entry } from '@stateforge-labs/session-ledger';
import { autocompactState } from '@stateforge-labs/session-ledger';
import type { DeciderState } from '@stateforge-labs/session-ledger';
import { contextOf, shareOf } from '@stateforge-labs/session-ledger';
import { COOLDOWN_DEFAULT_MS, CEILING_DEFAULT, KINDS_DEFAULT, parseGatePercent } from '@stateforge-labs/session-ledger';
import { gateOf as gateFrom } from '@stateforge-labs/session-ledger/compaction-timing';
import { duration, type Instant } from '@stateforge-labs/session-ledger';
import type { Gate } from '@stateforge-labs/session-ledger';
import { flightOf, flightReason, NOT_AWAITING, observedFrom, runningCount, unreadable } from '@stateforge-labs/session-ledger';
import { hindsightOf } from '#src/experiment/hindsight.ts';
import type { Hindsight } from '#src/experiment/hindsight.ts';
import { claudeWindowFor } from '../capability/context-window.ts';
import { extractClaudeOf } from '../transcripts/claude/rows.ts';
import { claudeInFlightOf } from '../transcripts/claude/in-flight.ts';
import { claudeObservedOf } from '../transcripts/claude/context.ts';
import { linesAfterOf, linesBeforeOf } from '../transcripts/slice.ts';
import type { ExperimentStore, FramePoint, StoredPoint } from './store.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { countOf, type Count } from '@stateforge-labs/session-ledger';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';

const TAIL_BYTES = 256 * 1024;
const EXPERIMENT_MINIMUM = 40;
const RECENT_KEPT = 60_000;

export type InFlight = Count | 'unknown';

export interface ShareReading {
    readonly tokens: Count;
    readonly window: Count;
    readonly share: Count;
}

export interface GateReading {
    readonly inFlight: InFlight;
    readonly gate: Gate;
}

export interface Point extends StoredPoint {
    readonly stratum: Text;
    readonly share: Count | null;
    readonly tokens: Count | null;
    readonly window: Count | null;
    readonly inFlight: InFlight;
    readonly lastBreakAt: Instant | null;
    readonly gate: Gate;
    readonly state: DeciderState;
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

export function shareAt(source: Text, cursor: Count, catalogue: ModelWindows): ShareReading | null {
    const observed = claudeObservedOf(linesBeforeOf(fsPathOf(source), cursor, countOf(TAIL_BYTES)));
    const use = observed === null ? null : contextOf({ observed, setting: null }, claudeWindowFor(catalogue));
    return use === null ? null : { tokens: use.tokens, window: use.window, share: shareOf(use) };
}

function gateAt(stored: StoredPoint, lines: readonly Text[], lastBreakAt: Instant | null, share: Count): GateReading {
    const flight = claudeInFlightOf(lines, 'absent');
    const inFlight = flight.kind === 'in-flight' ? countOf(flight.count) : 'unknown';
    const observed = flight.kind === 'in-flight' ? observedFrom(runningCount(countOf(flight.count)), flight.background, flightReason(textOf('running'))) : unreadable(flightReason(textOf('unreadable')));
    const gate = gateFrom({ kind: 'claude', kinds: KINDS_DEFAULT, shadowKinds: [], busy: 'free', flight: flightOf(observed, NOT_AWAITING), share: parseGatePercent(share), minimum: parseGatePercent(EXPERIMENT_MINIMUM), ceiling: parseGatePercent(CEILING_DEFAULT), now: stored.at, lastBreakAt, lastDecisionAt: null, cooldownMs: duration(COOLDOWN_DEFAULT_MS), unchanged: 'changed' }).gate;
    return { inFlight, gate };
}

export function pointOf(store: ExperimentStore, catalogue: ModelWindows, stored: FramePoint, stratum: Text): Point | null {
    try {
        const lines = linesBeforeOf(fsPathOf(stored.source), stored.cursor, countOf(TAIL_BYTES));
        const recent = trimmed(extractClaudeOf(lines).entries);
        const history = store.factsAt(stored);
        const used = shareAt(stored.source, stored.cursor, catalogue);
        const lastBreakAt = store.lastBreakAt(stored.tab, stored.at);
        const after = extractClaudeOf(linesAfterOf(fsPathOf(stored.source), stored.cursor, countOf(TAIL_BYTES))).entries;
        const { blob: _blob, ...plain } = stored;
        return {
            ...plain, stratum, share: used?.share ?? null, tokens: used?.tokens ?? null, window: used?.window ?? null, lastBreakAt, ...gateAt(stored, lines, lastBreakAt, used?.share ?? countOf(0)),
            state: autocompactState(recent, history), recent, history, hindsight: hindsightOf(after),
        };
    } catch {
        return null;
    }
}
