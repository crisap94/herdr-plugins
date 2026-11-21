import { knownOr } from '#src/ports/guarded-reads.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { Autocompact, type Waiting } from '#src/recap/application/autocompact.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import type { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import type { LaneClaims } from '#src/recap/application/lane-claims.ts';
import type { LaneRecent } from '#src/recap/application/lane-recent.ts';
import { lanesOf } from '#src/recap/domain/board.ts';
import { tabId, type PaneId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { hasRecap } from '#src/ports/recap-records.ts';
import type { Decider } from '#src/ports/decider.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { refreshVia } from './legacy.ts';
import type { LaneEvents } from '#src/recap/application/lane-events.ts';
import { awaitingOf } from '#src/recap/domain/coordination.ts';
import { readPaneTokens } from '#src/adapters/herdr/fleet.ts';
import { loadConfig, type Config } from './config.ts';
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
    readonly config?: () => Config;
    readonly awaiting?: (pane: PaneId) => Promise<Waiting>;
    readonly store: Store;
    readonly transcripts: TranscriptRegistry;
    readonly contexts: LaneContexts;
    readonly recent: LaneRecent;
    readonly recaps: Pick<TabRecaps, 'refresh' | 'flush'>;
    readonly informer: Informer;
    readonly decider: () => Decider | null;
    readonly events: LaneEvents;
    readonly claims: LaneClaims;
    log(line: Text): void;
}

export function wireAutocompact(parts: AutocompactParts): Autocompact {
    const { store } = parts;
    const flight = new TranscriptInFlight(parts.transcripts);
    const read = parts.config ?? loadConfig;
    return new Autocompact({
        policy: () => read().autocompact, tuning: () => read().tuning, idleHold: () => read().holdIdle, decider: parts.decider, contexts: parts.contexts, inFlight: (lane) => flightOf(flight, lane), awaiting: parts.awaiting ?? awaitingPane, events: parts.events, recent: (lane) => parts.recent.of(lane), startedAt: instant(Date.now() - process.uptime() * 1000),
        ledger: store.ledger, boundaries: store.boundaries, compactions: store.compactions, decisions: store.autocompact, requests: store.requests, claims: parts.claims, queue: store.requests,
        hasRecap: (tab) => { const recap = knownOr(store.records.readRecap(tab), null); return recap !== null && hasRecap(recap) ? 'recapped' : 'unrecapped'; },
        refresh: refreshVia(parts.recaps, store.records),
        flush: (tab, why): Promise<void> => parts.recaps.flush(tab, why),
        lanes: (tab) => lanesOf(parts.informer.current, tabId(tab)), now: () => instant(Date.now()), log: (line) => { parts.log(line); },
    });
}
