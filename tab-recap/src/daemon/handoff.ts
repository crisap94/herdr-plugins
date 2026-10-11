import { writeTx } from '#src/adapters/db/connection.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { handoffBytesOf } from '#src/adapters/db/handoff-ids.ts';
import { handoffPlans } from '#src/adapters/handoff-plan-registry.ts';
import { readPaneSession } from '#src/adapters/herdr-fleet.ts';
import type { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { GitWorksiteReader } from '#src/adapters/git-worksite.ts';
import { TranscriptInFlight } from '#src/adapters/transcript-in-flight.ts';
import { LOCAL_REQUESTER } from '#src/ports/ask-ledger.ts';
import type { Ask, AskKey, AskLedger } from '#src/ports/ask-ledger.ts';
import type { HandoffAnswers, HandoffVerdict } from '#src/ports/handoff-answers.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import type { HandoffRequestRow, Requests } from '#src/ports/requests.ts';
import { requestId } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import type { RequestId } from '#src/protocol/primitives.ts';
import { HandoffConfirmation } from '#src/recap/application/handoff-confirmation.ts';
import { HandoffFlow, unrendered } from '#src/recap/application/handoff-flow.ts';
import type { HandoffRun } from '#src/recap/application/handoff-flow.ts';
import { EditCounts } from '#src/recap/application/edit-counts.ts';
import { renderHandoff } from '#src/recap/application/handoff-pipeline.ts';
import type { HandoffLane } from '#src/recap/application/handoff-render.ts';
import { HandoffSender } from '#src/recap/application/handoff-sender.ts';
import type { LaneClaims } from '#src/recap/application/lane-claims.ts';
import { DeliveryMark } from '#src/recap/application/delivery-mark.ts';
import { RECAP_WAIT_MS } from '#src/recap/application/recap-wait.ts';
import type { RecapJob } from '#src/recap/application/recap-job.ts';
import { TypingLease } from '#src/recap/application/typing-lease.ts';
import { HANDOFF_ANSWER_TTL_MS, HANDOFF_FLOW_MAX_MS, HANDOFF_TAKE_MAX_AGE_MS } from '#src/recap/application/handoff-limits.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import { isStorable } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import { failureCauseOf } from '#src/recap/domain/failure-cause.ts';
import { parseHandoffId, sessionId, tabId } from '#src/recap/domain/ids.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import { loadConfig } from './config.ts';
import { awaitingNow } from './autocompact.ts';
import { within } from './bounded.ts';
import { refreshedWithin } from './refresh-status.ts';

export interface HandoffRunnerDeps {
    readonly flow: Pick<HandoffFlow, 'execute'>;
    readonly asks: AskLedger;
    readonly answers: HandoffAnswers;
    readonly claims: Pick<LaneClaims, 'release'>;
    readonly transaction: <T>(work: () => T) => T;
    readonly now: () => number;
    readonly log: (line: string) => void;
}

const askIdOf = (id: HandoffId): RequestId | null => {
    const bytes = handoffBytesOf(id);
    return bytes === null ? null : must(requestId(Buffer.from(bytes).toString('hex').slice(-16), 'legacy-length'));
};

function verdictOf(outcome: HandoffOutcome): HandoffVerdict {
    if (outcome.kind === 'delivered') {
        return { outcome: 'delivered', reason: null };
    }
    if (!isStorable(outcome) || !('reason' in outcome)) {
        return { outcome: 'failed', reason: 'internal-error' };
    }
    return { outcome: outcome.kind, reason: outcome.reason };
}

const internalError = (): HandoffRun => unrendered({ kind: 'failed', reason: 'internal-error' });

const settledOf = (outcome: HandoffOutcome): AskOutcome => ({ kind: outcome.kind === 'delivered' ? 'done' : 'settled' });

export class HandoffRunner {
    private readonly deps: HandoffRunnerDeps;

    constructor(deps: HandoffRunnerDeps) {
        this.deps = deps;
    }

    take(rows: readonly HandoffRequestRow[]): Promise<void> {
        return Promise.all(rows.map((row) => this.serve(row))).then(() => undefined);
    }

    interrupted(ask: Ask): void {
        try {
            const id = parseHandoffId(ask.ref);
            const { asks, answers, transaction } = this.deps;
            transaction(() => {
                if (id !== null) {
                    answers.answerHandoff(id, { outcome: 'failed', reason: 'interrupted' });
                }
                asks.settle({ exchange: ask.exchange, id: ask.id, pane: ask.pane }, { kind: 'interrupted' });
            });
            if (id === null) {
                this.deps.log(`handoff ask ${ask.id}: interrupted without a handoff id; no answer written`);
            }
        } catch (error) {
            this.deps.log(`handoff ask ${ask.id}: restart sweep failed ${failureCauseOf(error)}`);
        }
    }

    private async serve(row: HandoffRequestRow): Promise<void> {
        try {
            if (this.deps.now() - row.at > HANDOFF_TAKE_MAX_AGE_MS) {
                this.finish(row.id, unrendered({ kind: 'failed', reason: 'expired' }), null);
                return;
            }
            const id = askIdOf(row.id);
            if (id === null) {
                this.deps.log(`handoff ${row.id}: not a handoff id; not run`);
                return;
            }
            const key: AskKey = { exchange: HANDOFF_EXCHANGE, id, pane: row.pane };
            this.deps.asks.record({ ...key, requester: LOCAL_REQUESTER, at: this.deps.now(), ref: row.id });
            this.finish(row.id, await this.flowOf(row), key);
        } catch (error) {
            this.deps.log(`handoff ${row.id}: ${failureCauseOf(error)}`);
        }
    }

    private async flowOf(row: HandoffRequestRow): Promise<HandoffRun> {
        const mark = new DeliveryMark();
        const run = await within<HandoffRun | null>(this.deps.flow.execute(row, mark).catch((error: unknown) => this.crashed(row.id, error)), HANDOFF_FLOW_MAX_MS, null);
        if (run !== null) {
            return run;
        }
        const abandoned = mark.abandon();
        if (abandoned === 'claimed') {
            this.deps.claims.release(String(row.pane));
            this.deps.claims.release(String(row.toPane));
        }
        return unrendered({ kind: 'failed', reason: abandoned === 'typed' ? 'unconfirmed' : 'expired' });
    }

    private crashed(id: HandoffId, error: unknown): HandoffRun {
        this.deps.log(`handoff ${id}: ${failureCauseOf(error)}`);
        return internalError();
    }

    private finish(id: HandoffId, run: HandoffRun, key: AskKey | null): void {
        const { outcome, rendered } = run;
        this.record(id, verdictOf(outcome), key, settledOf(outcome));
        const reason = 'reason' in outcome ? ` ${outcome.reason}` : '';
        const text = rendered === null ? '' : ` bytes ${rendered.bytes} omitted ${rendered.omitted} withheld ${rendered.withheld}`;
        this.deps.log(`handoff ${id}: ${outcome.kind}${reason}${text}`);
    }

    private record(id: HandoffId, verdict: HandoffVerdict, key: AskKey | null, settled: AskOutcome): void {
        const { asks, answers, transaction } = this.deps;
        const write = (): void => {
            transaction(() => {
                answers.answerHandoff(id, verdict);
                if (key !== null) {
                    asks.settle(key, settled);
                }
            });
        };
        if (this.attempt(write, `handoff ${id}: answer write failed, retrying`)) {
            return;
        }
        if (this.attempt(write, `handoff ${id}: answer write failed again`)) {
            return;
        }
        if (key !== null && this.attempt(() => { transaction(() => { asks.settle(key, { kind: 'settled' }); }); }, `handoff ${id}: ask settle failed`)) {
            this.deps.log(`handoff ${id}: ask settled without its answer`);
        }
    }

    private attempt(work: () => void, note: string): boolean {
        try {
            work();
            return true;
        } catch (error) {
            this.deps.log(`${note}: ${failureCauseOf(error)}`);
            return false;
        }
    }
}

export function pollHandoffs(parts: { readonly runner: Pick<HandoffRunner, 'take'>; readonly requests: Pick<Requests, 'takeHandoffs'>; readonly log: (line: string) => void }): void {
    parts.runner.take(parts.requests.takeHandoffs()).catch((error: unknown) => { parts.log(`handoff poll: ${failureCauseOf(error)}`); });
}

export function pruneHandoffAnswers(parts: { readonly answers: Pick<HandoffAnswers, 'prune'>; readonly now: () => number }): void {
    parts.answers.prune(parts.now() - HANDOFF_ANSWER_TTL_MS);
}

export function handoffRestartOf(runner: Pick<HandoffRunner, 'interrupted'>): (ask: Ask) => void {
    return (ask: Ask): void => { runner.interrupted(ask); };
}

export interface HandoffWiring {
    readonly store: Store;
    readonly fleet: HerdrFleet;
    readonly transcripts: TranscriptRegistry;
    readonly repos: LaneRepo;
    readonly claims: LaneClaims;
    readonly recaps: Pick<RecapJob, 'refreshNow'>;
    readonly board: () => Board;
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
    const { store, fleet, transcripts, repos, claims, recaps, board, pause, log } = parts;
    const flow = new HandoffFlow({
        lanes: (): readonly Lane[] => [...board().lanes.values()], records: store.records, ledger: store.ledger,
        closed: { closures: store.closedLanes, ledger: store.ledger, runs: store.closedLanes, closedDays: (): ClosedLaneDays => loadConfig().closedLaneDays },
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
    return new HandoffRunner({ flow, asks: store.asks, answers: store.handoffs, claims, transaction: (work) => writeTx(store.db, work), now, log });
}
