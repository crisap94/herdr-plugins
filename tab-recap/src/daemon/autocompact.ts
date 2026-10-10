import type { RecapJob } from '#src/recap/application/recap-job.ts';
import { Autocompact, type FlightAnswer, type Waiting } from '#src/recap/application/autocompact.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import type { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import type { CompactionClaims } from '#src/recap/application/compaction-claims.ts';
import type { LaneRecent } from '#src/recap/application/lane-recent.ts';
import { lanesOf } from '#src/recap/domain/board.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { hasRecap } from '#src/ports/recap-records.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { Decider } from '#src/ports/decider.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { bounded } from './bounded.ts';
import type { LaneEvents } from '#src/recap/application/lane-events.ts';
import { awaitingOf } from '#src/recap/domain/coordination.ts';
import { readPaneTokens } from '#src/adapters/herdr-fleet.ts';
import { loadConfig, type Config } from './config.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { inFlightReason } from '#src/ports/autocompact-reasons.ts';
import { IN_FLIGHT_CAPABILITIES } from '#src/adapters/transcript-registry.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import { capabilityWording } from '#src/ports/capability-reasons.ts';

const RECAP_WAIT_MS = 90_000;
const TAIL_BYTES = 512 * 1024;

async function inFlightOf(transcripts: TranscriptRegistry, lane: Lane): Promise<FlightAnswer> {
    const agent = String(lane.agent);
    const registered = registeredKindOf(agent);
    if (registered !== null) {
        const capability = IN_FLIGHT_CAPABILITIES[registered];
        if (capability.kind === 'unsupported') return { count: 'unknown', why: capabilityWording(capability.why, agent) };
    }
    const exact = transcripts.exact(agent);
    const reader = exact ?? transcripts.readerFor(agent);
    if (reader === undefined) return { count: 'unknown', why: inFlightReason('unregistered-reader', agent) };
    const located = await reader.locate(lane);
    if (isUnknown(located)) return { count: 'unknown', why: exact === undefined ? inFlightReason('unregistered-reader', agent) : saying(located.why) };
    if (reader.inFlight.kind === 'unsupported') return { count: 'unknown', why: inFlightReason(reader.inFlight.why, agent) };
    const found = await reader.inFlight.read(located.source, TAIL_BYTES);
    return isUnknown(found) ? { count: 'unknown', why: saying(found.why) } : { count: found.count, why: `${found.count} running` };
}

async function awaitingNow(pane: string): Promise<Waiting> {
    const found = await readPaneTokens(pane);
    if (found.kind !== 'tokens') return found;
    const value = awaitingOf(found.tokens);
    return value === null ? { kind: 'clear' } : { kind: 'waiting', value };
}

export function wireAutocompact(parts: {
    readonly config?: () => Config;
    readonly awaiting?: (pane: string) => Promise<Waiting>;
    readonly store: Store;
    readonly transcripts: TranscriptRegistry;
    readonly contexts: LaneContexts;
    readonly recent: LaneRecent;
    readonly recaps: RecapJob;
    readonly informer: Informer;
    readonly decider: () => Decider | null;
    readonly events: LaneEvents;
    readonly claims: CompactionClaims;
    log(line: string): void;
}): Autocompact {
    const { store } = parts;
    const read = parts.config ?? loadConfig;
    return new Autocompact({
        policy: () => read().autocompact, tuning: () => read().tuning, decider: parts.decider, contexts: parts.contexts, inFlight: (lane) => inFlightOf(parts.transcripts, lane), awaiting: parts.awaiting ?? awaitingNow, events: parts.events, recent: (lane) => parts.recent.of(lane), startedAt: Date.now() - process.uptime() * 1000,
        ledger: store.ledger, boundaries: store.boundaries, compactions: store.compactions, decisions: store.autocompact, requests: store.requests, claims: parts.claims, queue: store.requests,
        hasRecap: (tab) => { const recap = store.records.readRecap(tab); return recap !== null && hasRecap(recap); },
        refresh: async (tab, lanes) => { await bounded(parts.recaps.refreshNow(tabId(tab), lanes), RECAP_WAIT_MS); },
        lanes: (tab) => lanesOf(parts.informer.current, tabId(tab)), now: () => Date.now(), log: (line) => { parts.log(line); },
    });
}
