import { knownOr } from '#src/ports/guarded-reads.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { Autocompact, type Waiting } from '#src/recap/application/autocompact.ts';
import { ACTIVE } from '#src/recap/application/autocompact-gates.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import type { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import type { LaneClaims } from '#src/recap/application/lane-claims.ts';
import type { LaneRecent } from '#src/recap/application/lane-recent.ts';
import { lanesOf, type Board } from '#src/recap/domain/board.ts';
import { paneId, tabId, type PaneId } from '#src/recap/domain/ids.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { READY } from '#src/recap/domain/status.ts';
import { parseLaneStatusAtDecision } from '#src/recap/domain/autocompact.ts';
import { parseHarnessKind, parseScopeId, parseSessionKey, type ScopeId, type SessionKey } from '@stateforge-labs/session-ledger';
import type { Candidate, CompactionActivity, RecapReadiness, SafePointEvent, SessionSignals } from '@stateforge-labs/session-ledger/compaction-timing';
import { flightReason, unreadable, type Observed } from '#src/recap/domain/in-flight.ts';
import { instant } from '#src/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text, textOf } from '#src/recap/domain/text.ts';
import { hasRecap } from '#src/ports/recap-records.ts';
import type { DeciderPort } from '#src/ports/decider.ts';
import type { CompactTuning } from '#src/recap/domain/autocompact-style.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { refreshVia } from './refresh-status.ts';
import type { LaneEvents } from '#src/recap/application/lane-events.ts';
import { awaitingOf } from '#src/recap/domain/coordination.ts';
import { readPaneTokens } from '#src/adapters/herdr/fleet.ts';
import { loadSettings, type Settings } from './config.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { TranscriptInFlight } from '#src/adapters/transcripts/in-flight.ts';
import { flightOf } from '#src/recap/application/in-flight.ts';

export async function awaitingPane(pane: PaneId): Promise<Waiting> {
    const found = await readPaneTokens(pane);
    if (found.kind !== 'tokens') return found;
    const value = awaitingOf(found.tokens);
    return value === null ? { kind: 'clear' } : { kind: 'waiting', value: must(parseText(value)) };
}

interface AutocompactParts {
    readonly config?: () => Settings;
    readonly awaiting?: (pane: PaneId) => Promise<Waiting>;
    readonly store: Store;
    readonly transcripts: TranscriptRegistry;
    readonly contexts: LaneContexts;
    readonly recent: LaneRecent;
    readonly recaps: Pick<TabRecaps, 'refresh' | 'flush'>;
    readonly informer: Informer;
    readonly decider: () => DeciderPort | null;
    readonly events: LaneEvents;
    readonly claims: LaneClaims;
    log(line: Text): void;
}

const lanesBehind = new WeakMap<Candidate, Lane>();

export function candidateOf(lane: Lane): Candidate | null {
    const scope = parseScopeId(lane.tab);
    const key = parseSessionKey(lane.pane);
    const harness = parseHarnessKind(lane.agent);
    if (scope.kind === 'err' || key.kind === 'err' || harness.kind === 'err') return null;
    const candidate: Candidate = { scope: scope.value, key: key.value, harness: harness.value, ready: READY.has(lane.status) };
    lanesBehind.set(candidate, lane);
    return candidate;
}

export function candidatesOf(board: Board, log: (line: Text) => void): readonly Candidate[] {
    return [...board.lanes.values()].flatMap((lane) => {
        const candidate = candidateOf(lane);
        if (candidate === null) log(must(parseText(`autocompact sweep: skipped lane ${lane.pane}: not a valid session key`)));
        return candidate === null ? [] : [candidate];
    });
}

const emitTo = (events: LaneEvents, event: SafePointEvent): void => {
    if (event.kind === 'session-skipped') events.lane(paneId(textOf(event.key)), 'autocompact-skipped', event.gate);
    else if (event.kind === 'safe-point-decided') events.lane(paneId(textOf(event.key)), 'autocompact-decided', `${event.verdict}-${event.share}`);
};

const activityOf = (parts: AutocompactParts): Pick<CompactionActivity, 'activeFor' | 'automaticInProgress'> => {
    function activeFor(scope: ScopeId, key: SessionKey): boolean {
        return parts.store.compactions.shownFor(tabId(textOf(scope))).some((record) => record.pane === paneId(textOf(key)) && ACTIVE.has(record.stage)) || parts.claims.has(paneId(textOf(key))) || parts.store.requests.compactQueued(tabId(textOf(scope)), paneId(textOf(key))) === 'queued';
    }
    function automaticInProgress(): boolean {
        return parts.store.compactions.autoInProgress() === 'auto-in-progress';
    }
    return { activeFor, automaticInProgress };
};

const signalsOf = (store: Store): Pick<SessionSignals, 'lastBreakAt'> => {
    function lastBreakAt(scope: ScopeId, key: SessionKey): number | null {
        return store.boundaries.lastBreakAt(tabId(textOf(scope)), paneId(textOf(key)));
    }
    return { lastBreakAt };
};

const readinessOf = (parts: AutocompactParts): RecapReadiness => {
    const refresh = refreshVia(parts.recaps, parts.store.records);
    return {
        ensure: async (scope) => {
            const tab = tabId(textOf(scope));
            await parts.recaps.flush(tab, 'autocompact');
            const recap = knownOr(parts.store.records.readRecap(tab), null);
            if (!(recap !== null && hasRecap(recap))) await refresh(tab, lanesOf(parts.informer.current, tab));
        },
    };
};

const inFlightOf = (flight: TranscriptInFlight, candidate: Candidate): Promise<Observed> => {
    const lane = lanesBehind.get(candidate);
    return lane === undefined ? Promise.resolve(unreadable(flightReason(textOf('no lane behind the candidate')))) : flightOf(flight, lane);
};

export function wireAutocompact(parts: AutocompactParts): Autocompact {
    const { store } = parts;
    const flight = new TranscriptInFlight(parts.transcripts);
    const read = parts.config ?? loadSettings;
    return new Autocompact({
        policy: () => read().autocompact, tuning: (): CompactTuning => read().tuning, idleHold: () => read().holdIdle, decider: parts.decider, contexts: parts.contexts, inFlight: (candidate) => inFlightOf(flight, candidate), awaiting: parts.awaiting ?? awaitingPane, emit: (event) => { emitTo(parts.events, event); }, recent: (candidate) => { const lane = lanesBehind.get(candidate); return lane === undefined ? Promise.resolve([]) : parts.recent.of(lane); }, statusOf: (candidate) => parseLaneStatusAtDecision(lanesBehind.get(candidate)?.status), startedAt: instant(Date.now() - process.uptime() * 1000),
        ledger: store.ledger, sessions: signalsOf(store), activity: activityOf(parts), decisions: store.decisions, request: (ask) => { store.requests.requestCompact({ tab: tabId(textOf(ask.scope)), pane: paneId(textOf(ask.key)), note: ask.note === null ? null : textOf(ask.note), origin: 'auto' }); },
        recaps: readinessOf(parts),
        now: () => instant(Date.now()), log: (line) => { parts.log(line); },
    });
}
