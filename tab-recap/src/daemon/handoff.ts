import { writeTx } from '#src/adapters/db/connection.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { handoffBytesOf } from '#src/adapters/db/handoff-ids.ts';
import { handoffPlans } from '#src/adapters/capability/handoff-plans.ts';
import { readPaneSession } from '#src/adapters/herdr/fleet.ts';
import type { Fleet } from '#src/ports/fleet.ts';
import { GitWorksiteReader } from '#src/adapters/git/worksite.ts';
import { TranscriptInFlight } from '#src/adapters/transcripts/in-flight.ts';
import { LOCAL_REQUESTER, type Ask, type AskKey, type AskLedger } from '#src/ports/ask-ledger.ts';
import type { HandoffAnswers } from '#src/ports/handoff-answers.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import type { HandoffRequestRow, Requests } from '#src/ports/requests.ts';
import { requestId, type RequestId } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { HandoffFlow, unrendered, type HandoffRun } from '#src/recap/application/handoff-flow.ts';
import { HandoffConfirmation } from '#src/recap/application/handoff-confirmation.ts';
import { EditCounts } from '#src/recap/application/edit-counts.ts';
import { renderHandoff } from '#src/recap/application/handoff-pipeline.ts';
import type { HandoffLane } from '#src/recap/application/handoff-render.ts';
import { HandoffSender } from '#src/recap/application/handoff-sender.ts';
import { askKeyOf, type HandoffMirror, type Route } from '#src/recap/application/handoff-mirror.ts';
import type { LaneClaims } from '#src/recap/application/lane-claims.ts';
import { DeliveryMark } from '#src/recap/application/delivery-mark.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { TypingLease } from '#src/recap/application/typing-lease.ts';
import { HANDOFF_ANSWER_TTL_MS, HANDOFF_FLOW_MAX_MS, HANDOFF_TAKE_MAX_AGE_MS } from '#src/recap/application/handoff-limits.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import { storedOf, type HandoffOutcome, type StoredHandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { failureCauseOf } from '#src/recap/domain/failure-cause.ts';
import { parseHandoffId, sessionId, type HandoffId } from '#src/recap/domain/ids.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { instant, type Duration, type Instant } from '#src/recap/domain/time.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import { awaitingNow, logVia, pauseVia, refreshVia } from './legacy.ts';
import { within } from './bounded.ts';

export interface HandoffRunnerDeps {
    readonly flow: Pick<HandoffFlow, 'execute'>;
    readonly asks: AskLedger;
    readonly answers: HandoffAnswers;
    readonly claims: Pick<LaneClaims, 'release'>;
    readonly mirror: HandoffMirror;
    readonly transaction: <T>(work: () => T) => T;
    readonly now: () => Instant;
    readonly log: (line: Text) => void;
}

const askIdOf = (id: HandoffId): RequestId | null => {
    const bytes = handoffBytesOf(id);
    return bytes === null ? null : must(requestId(Buffer.from(bytes).toString('hex').slice(-16), 'legacy-length'));
};

const internalError = (): HandoffRun => unrendered({ kind: 'failed', reason: 'internal-error' });

const settledOf = (outcome: HandoffOutcome): AskOutcome => ({ kind: outcome.kind === 'delivered' ? 'done' : 'settled' });

type AttemptOutcome = 'written' | 'failed';

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
                if (id !== null) { answers.answerHandoff(id, { kind: 'failed', reason: 'interrupted' }); }
                asks.settle({ exchange: ask.exchange, id: ask.id, pane: ask.pane }, { kind: 'interrupted' });
            });
            if (id === null) { this.deps.log(must(parseText(`handoff ask ${ask.id}: interrupted without a handoff id; no answer written`))); }
        } catch (error) {
            this.deps.log(must(parseText(`handoff ask ${ask.id}: restart sweep failed ${failureCauseOf(error)}`)));
        }
    }

    private async serve(row: HandoffRequestRow): Promise<void> {
        try {
            if (row.answer === undefined || row.answer === null) {
                await this.serveLocal(row);
            } else {
                await this.serveAsked(row);
            }
        } catch (error) {
            this.deps.log(must(parseText(`handoff ${row.id}: ${failureCauseOf(error)}`)));
        }
    }

    private async serveLocal(row: HandoffRequestRow): Promise<void> {
        if (this.deps.now() - row.at > HANDOFF_TAKE_MAX_AGE_MS) {
            this.finish(row.id, unrendered({ kind: 'failed', reason: 'expired' }), null);
            return;
        }
        const id = askIdOf(row.id);
        if (id === null) {
            this.deps.log(must(parseText(`handoff ${row.id}: not a handoff id; not run`)));
            return;
        }
        const key: AskKey = { exchange: HANDOFF_EXCHANGE, id, pane: row.pane };
        this.deps.asks.record({ ...key, requester: LOCAL_REQUESTER, at: this.deps.now(), ref: row.id });
        this.finish(row.id, await this.flowOf(row), key);
    }

    private async serveAsked(row: HandoffRequestRow): Promise<void> {
        const route = this.deps.mirror.routeOf(row);
        if (route === null) {
            this.deps.log(must(parseText(`handoff ${row.id}: no ask recorded for it; not run`)));
            return;
        }
        if (this.deps.now() - row.at > HANDOFF_TAKE_MAX_AGE_MS) {
            this.concludeAsked(row, route, unrendered({ kind: 'failed', reason: 'expired' }));
            return;
        }
        this.deps.mirror.running(route);
        this.concludeAsked(row, route, await this.flowOf(row));
    }

    private concludeAsked(row: HandoffRequestRow, route: Route, run: HandoffRun): void {
        this.finish(row.id, run, askKeyOf(route));
        this.deps.mirror.terminal(route, run.outcome);
    }

    private async flowOf(row: HandoffRequestRow): Promise<HandoffRun> {
        const mark = new DeliveryMark();
        const run = await within<HandoffRun | null>(this.executed(row, mark), HANDOFF_FLOW_MAX_MS, null);
        if (run !== null) { return run; }
        const abandoned = mark.abandon();
        if (abandoned === 'claimed') {
            this.deps.claims.release(String(row.pane));
            this.deps.claims.release(String(row.toPane));
        }
        return unrendered({ kind: 'failed', reason: abandoned === 'typed' ? 'unconfirmed' : 'expired' });
    }

    private async executed(row: HandoffRequestRow, mark: DeliveryMark): Promise<HandoffRun> {
        try {
            return await this.deps.flow.execute(row, mark);
        } catch (error) {
            this.deps.log(must(parseText(`handoff ${row.id}: ${failureCauseOf(error)}`)));
            return internalError();
        }
    }

    private finish(id: HandoffId, run: HandoffRun, key: AskKey | null): void {
        const { outcome, rendered } = run;
        this.record(id, storedOf(outcome), key, settledOf(outcome));
        const reason = 'reason' in outcome ? ` ${outcome.reason}` : '';
        const text = rendered === null ? '' : ` bytes ${rendered.bytes} omitted ${rendered.omitted} withheld ${rendered.withheld}`;
        this.deps.log(must(parseText(`handoff ${id}: ${outcome.kind}${reason}${text}`)));
    }

    private record(id: HandoffId, stored: StoredHandoffOutcome, key: AskKey | null, settled: AskOutcome): void {
        const { asks, answers, transaction } = this.deps;
        const write = (): void => {
            transaction(() => {
                answers.answerHandoff(id, stored);
                if (key !== null) {
                    asks.settle(key, settled);
                }
            });
        };
        if (this.attempt(write, must(parseText(`handoff ${id}: answer write failed, retrying`))) === 'written') { return; }
        if (this.attempt(write, must(parseText(`handoff ${id}: answer write failed again`))) === 'written') { return; }
        if (key !== null && this.attempt(() => { transaction(() => { asks.settle(key, { kind: 'settled' }); }); }, must(parseText(`handoff ${id}: ask settle failed`))) === 'written') {
            this.deps.log(must(parseText(`handoff ${id}: ask settled without its answer`)));
        }
    }

    private attempt(work: () => void, note: Text): AttemptOutcome {
        try {
            work();
            return 'written';
        } catch (error) {
            this.deps.log(must(parseText(`${note}: ${failureCauseOf(error)}`)));
            return 'failed';
        }
    }
}

interface HandoffPollParts {
    readonly runner: Pick<HandoffRunner, 'take'>;
    readonly requests: Pick<Requests, 'takeHandoffs'>;
    readonly log: (line: Text) => void;
}

interface HandoffPruneParts {
    readonly answers: Pick<HandoffAnswers, 'prune'>;
    readonly now: () => Instant;
}

export function pollHandoffs(parts: HandoffPollParts): void {
    void pollOnce(parts);
}

async function pollOnce(parts: HandoffPollParts): Promise<void> {
    try {
        await parts.runner.take(parts.requests.takeHandoffs());
    } catch (error) {
        parts.log(must(parseText(`handoff poll: ${failureCauseOf(error)}`)));
    }
}

export function pruneHandoffAnswers(parts: HandoffPruneParts): void {
    parts.answers.prune(parts.now() - HANDOFF_ANSWER_TTL_MS);
}

export function handoffRestartOf(runner: Pick<HandoffRunner, 'interrupted'>): (ask: Ask) => void {
    return (ask: Ask): void => { runner.interrupted(ask); };
}

export interface HandoffWiring {
    readonly store: Store;
    readonly fleet: Fleet;
    readonly transcripts: TranscriptRegistry;
    readonly repos: LaneRepo;
    readonly claims: LaneClaims;
    readonly recaps: Pick<TabRecaps, 'refresh' | 'flush'>;
    readonly board: () => Board;
    readonly mirror: HandoffMirror;
    readonly pause: (span: Duration) => Promise<void>;
    readonly log: (line: Text) => void;
}

const now = (): Instant => instant(Date.now());

async function sourceOf(transcripts: TranscriptRegistry, board: () => Board, lane: HandoffLane): Promise<FsPath | null> {
    const full = board().lanes.get(lane.pane);
    if (full === undefined) { return null; }
    const reader = transcripts.readerFor(String(lane.agent));
    const session = await readPaneSession(String(lane.pane));
    if (reader === undefined || typeof session !== 'string') { return null; }
    const located = await reader.locate({ ...full, session: sessionId(session) });
    if (isUnknown(located)) { return null; }
    const parsed = parseFsPath(located.source);
    return parsed.kind === 'ok' ? parsed.value : null;
}

export function wireHandoffs(parts: HandoffWiring): HandoffRunner {
    const { store, fleet, transcripts, repos, claims, recaps, board, mirror } = parts;
    const pause = pauseVia(parts.pause);
    const log = logVia(parts.log);
    const flow = new HandoffFlow({
        lanes: (): readonly Lane[] => [...board().lanes.values()], records: store.records, ledger: store.ledger,
        closed: { closures: store.closedLanes, ledger: store.ledger, runs: store.closedLanes, closedDays: (): ClosedLaneDays => store.closedDays },
        target: { plans: handoffPlans, inFlight: new TranscriptInFlight(transcripts), awaiting: awaitingNow },
        claims, refresh: refreshVia(recaps, store.records), flush: (tab, why): Promise<void> => recaps.flush(tab, why),
        render: renderHandoff({
            records: store.records,
            transcripts,
            locate: (lane: HandoffLane): Promise<FsPath | null> => sourceOf(transcripts, board, lane),
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
    return new HandoffRunner({ flow, asks: store.asks, answers: store.handoffs, claims, mirror, transaction: (work) => writeTx(store.db, work), now, log: parts.log });
}
