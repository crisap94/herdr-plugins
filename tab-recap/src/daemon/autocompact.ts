import type { RecapJob } from '#src/recap/application/recap-job.ts';
import { Autocompact } from '#src/recap/application/autocompact.ts';
import type { FlightAnswer } from '#src/recap/application/autocompact.ts';
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
import type { Waiting } from '#src/recap/application/autocompact.ts';
import { loadConfig } from './config.ts';
import type { Config } from './config.ts';
import { registryOf } from '#src/ports/transcripts.ts';
import type { TranscriptRegistryInput } from '#src/ports/transcripts.ts';

const RECAP_WAIT_MS = 90_000;
const TAIL_BYTES = 512 * 1024;

async function inFlightOf(transcripts: TranscriptRegistryInput, lane: Lane): Promise<FlightAnswer> {
    const agent = String(lane.agent);
    const reader = registryOf(transcripts).exact(agent);
    const located = reader === undefined ? null : await reader.locate(lane);
    if (reader?.inFlight === undefined) return { count: 'unknown', why: `no reader for ${agent}` };
    if (located === null || isUnknown(located)) return { count: 'unknown', why: located === null ? 'no transcript' : saying(located.why) };
    const found = await reader.inFlight(located.source, TAIL_BYTES);
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
    readonly transcripts: TranscriptRegistryInput;
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
