// The composition of autocompact: the daemon's parts, handed to the one service that decides (it never types: the compaction flow does).
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
import type { Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { Decider } from '#src/ports/decider.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { bounded } from './bounded.ts';
import type { LaneEvents } from '#src/recap/application/lane-events.ts';
import { awaitingOf } from '#src/recap/domain/coordination.ts';
import { readPaneTokens } from '#src/adapters/herdr-fleet.ts';
import type { Waiting } from '#src/recap/application/autocompact.ts';
import { loadConfig } from './config.ts';

/** a lane's recap is given up on after this long (the decision goes on without) */
const RECAP_WAIT_MS = 90_000;
/** the end of a transcript looked through for work still running */
const TAIL_BYTES = 512 * 1024;

/** The work the lane's agent started and has not ended; `unknown` when its reader cannot tell (that counts as in flight), with the reason. */
async function inFlightOf(transcripts: readonly Transcripts[], lane: Lane): Promise<FlightAnswer> {
    const agent = String(lane.agent);
    const reader = transcripts.find((candidate) => candidate.agent === agent);
    const located = reader === undefined ? null : await reader.locate(lane);
    if (reader?.inFlight === undefined) return { count: 'unknown', why: `no reader for ${agent}` };
    if (located === null || isUnknown(located)) return { count: 'unknown', why: located === null ? 'no transcript' : saying(located.why) };
    const found = await reader.inFlight(located.source, TAIL_BYTES);
    return isUnknown(found) ? { count: 'unknown', why: saying(found.why) } : { count: found.count, why: `${found.count} running` };
}

/** The pane's `awaiting` tokens now: clear, waiting for what, or unreadable (herdr could not say). */
async function awaitingNow(pane: string): Promise<Waiting> {
    const found = await readPaneTokens(pane);
    if (found.kind !== 'tokens') return found;
    const value = awaitingOf(found.tokens);
    return value === null ? { kind: 'clear' } : { kind: 'waiting', value };
}

export function wireAutocompact(parts: {
    readonly store: Store;
    readonly transcripts: readonly Transcripts[];
    readonly contexts: LaneContexts;
    readonly recent: LaneRecent;
    readonly recaps: RecapJob;
    readonly informer: Informer;
    readonly decider: () => Decider | null;
    readonly events: LaneEvents;
    /** the compactions queued or running in this daemon: shared with the compaction flow, so a lane has one at a time */
    readonly claims: CompactionClaims;
    log(line: string): void;
}): Autocompact {
    const { store } = parts;
    return new Autocompact({
        policy: () => loadConfig().autocompact, decider: parts.decider, contexts: parts.contexts, inFlight: (lane) => inFlightOf(parts.transcripts, lane), awaiting: (pane) => awaitingNow(pane), events: parts.events, recent: (lane) => parts.recent.of(lane), startedAt: Date.now() - process.uptime() * 1000,
        ledger: store.ledger, boundaries: store.boundaries, compactions: store.compactions, decisions: store.autocompact, requests: store.requests, claims: parts.claims, queue: store.requests,
        hasRecap: (tab) => { const recap = store.records.readRecap(tab); return recap !== null && hasRecap(recap); },
        refresh: async (tab, lanes) => { await bounded(parts.recaps.refreshNow(tabId(tab), lanes), RECAP_WAIT_MS); },
        lanes: (tab) => lanesOf(parts.informer.current, tabId(tab)), now: () => Date.now(), log: (line) => { parts.log(line); },
    });
}
