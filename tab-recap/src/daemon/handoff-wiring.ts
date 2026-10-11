import { writeTx } from '#src/adapters/db/connection.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { handoffPlans } from '#src/adapters/handoff-plan-registry.ts';
import { readPaneSession } from '#src/adapters/herdr-fleet.ts';
import type { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { GitWorksiteReader } from '#src/adapters/git-worksite.ts';
import { TranscriptInFlight } from '#src/adapters/transcript-in-flight.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { HandoffConfirmation } from '#src/recap/application/handoff-confirmation.ts';
import { HandoffFlow } from '#src/recap/application/handoff-flow.ts';
import { EditCounts } from '#src/recap/application/edit-counts.ts';
import { renderHandoff } from '#src/recap/application/handoff-pipeline.ts';
import type { HandoffLane } from '#src/recap/application/handoff-render.ts';
import { HandoffSender } from '#src/recap/application/handoff-sender.ts';
import type { HandoffMirror } from '#src/recap/application/handoff-mirror.ts';
import type { LaneClaims } from '#src/recap/application/lane-claims.ts';
import { RECAP_WAIT_MS } from '#src/recap/application/recap-wait.ts';
import type { RecapJob } from '#src/recap/application/recap-job.ts';
import { TypingLease } from '#src/recap/application/typing-lease.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { sessionId, tabId } from '#src/recap/domain/ids.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import { awaitingNow } from './autocompact.ts';
import { HandoffRunner } from './handoff.ts';
import { refreshedWithin } from './refresh-status.ts';

export interface HandoffWiring {
    readonly store: Store;
    readonly fleet: HerdrFleet;
    readonly transcripts: TranscriptRegistry;
    readonly repos: LaneRepo;
    readonly claims: LaneClaims;
    readonly recaps: Pick<RecapJob, 'refreshNow'>;
    readonly board: () => Board;
    readonly mirror: HandoffMirror;
    readonly pause: (ms: number) => Promise<void>;
    readonly log: (line: string) => void;
}

const now = (): number => Date.now();

async function sourceOf(transcripts: TranscriptRegistry, board: () => Board, lane: HandoffLane): Promise<string | null> {
    const full = board().lanes.get(lane.pane);
    if (full === undefined) {
        return null;
    }
    const reader = transcripts.readerFor(String(lane.agent));
    const session = await readPaneSession(String(lane.pane));
    if (reader === undefined || typeof session !== 'string') {
        return null;
    }
    const located = await reader.locate({ ...full, session: sessionId(session) });
    return isUnknown(located) ? null : located.source;
}

export function wireHandoffs(parts: HandoffWiring): HandoffRunner {
    const { store, fleet, transcripts, repos, claims, recaps, board, mirror, pause, log } = parts;
    const flow = new HandoffFlow({
        lanes: (): readonly Lane[] => [...board().lanes.values()], records: store.records, ledger: store.ledger,
        closed: { closures: store.closedLanes, ledger: store.ledger, runs: store.closedLanes, closedDays: (): ClosedLaneDays => store.closedDays },
        target: { plans: handoffPlans, inFlight: new TranscriptInFlight(transcripts), awaiting: awaitingNow },
        claims, refresh: (tab: string, lanes: readonly Lane[]): Promise<RefreshStatus> => refreshedWithin(recaps.refreshNow(tabId(tab), lanes), store.records, tab, RECAP_WAIT_MS),
        render: renderHandoff({
            records: store.records,
            transcripts,
            locate: (lane: HandoffLane): Promise<string | null> => sourceOf(transcripts, board, lane),
            worksite: { reader: new GitWorksiteReader(), repo: repos, edits: new EditCounts(transcripts) },
            tokens: fleet,
        }),
        sender: new HandoffSender({
            agents: fleet.agents(),
            typing: new TypingLease({ tokens: fleet, panes: fleet, now, pause, log }),
            confirmation: new HandoffConfirmation({ agents: fleet.agents(), transcripts, session: readPaneSession, pause, log }),
            log,
        }),
        pause, now, log,
    });
    return new HandoffRunner({ flow, asks: store.asks, answers: store.handoffs, claims, mirror, transaction: (work) => writeTx(store.db, work), now, log });
}
