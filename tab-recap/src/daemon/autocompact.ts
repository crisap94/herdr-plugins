import type { RecapJob } from '#src/recap/application/recap-job.ts';
import { Autocompact, type Waiting } from '#src/recap/application/autocompact.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import type { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import type { LaneClaims } from '#src/recap/application/lane-claims.ts';
import type { LaneRecent } from '#src/recap/application/lane-recent.ts';
import { lanesOf } from '#src/recap/domain/board.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { hasRecap } from '#src/ports/recap-records.ts';
import type { Decider } from '#src/ports/decider.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { refreshedWithin } from './refresh-status.ts';
import type { LaneEvents } from '#src/recap/application/lane-events.ts';
import { awaitingOf } from '#src/recap/domain/coordination.ts';
import { readPaneTokens } from '#src/adapters/herdr-fleet.ts';
import { loadConfig, type Config } from './config.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { TranscriptInFlight } from '#src/adapters/transcript-in-flight.ts';
import { flightOf } from '#src/recap/application/in-flight.ts';
import { RECAP_WAIT_MS } from '#src/recap/application/recap-wait.ts';

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
    readonly claims: LaneClaims;
    log(line: string): void;
}): Autocompact {
    const { store } = parts;
    const flight = new TranscriptInFlight(parts.transcripts);
    const read = parts.config ?? loadConfig;
    return new Autocompact({
        policy: () => read().autocompact, tuning: () => read().tuning, decider: parts.decider, contexts: parts.contexts, inFlight: (lane) => flightOf(flight, lane), awaiting: parts.awaiting ?? awaitingNow, events: parts.events, recent: (lane) => parts.recent.of(lane), startedAt: Date.now() - process.uptime() * 1000,
        ledger: store.ledger, boundaries: store.boundaries, compactions: store.compactions, decisions: store.autocompact, requests: store.requests, claims: parts.claims, queue: store.requests,
        hasRecap: (tab) => { const recap = store.records.readRecap(tab); return recap !== null && hasRecap(recap); },
        refresh: (tab, lanes) => refreshedWithin(parts.recaps.refreshNow(tabId(tab), lanes), store.records, tab, RECAP_WAIT_MS),
        lanes: (tab) => lanesOf(parts.informer.current, tabId(tab)), now: () => Date.now(), log: (line) => { parts.log(line); },
    });
}
