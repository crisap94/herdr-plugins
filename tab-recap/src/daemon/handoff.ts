import { writeTx } from '#src/adapters/db/connection.ts';
import type { Store } from '#src/adapters/db/database.ts';
import { handoffBytesOf } from '#src/adapters/db/handoff-ids.ts';
import { handoffPlans } from '#src/adapters/handoff-plan-registry.ts';
import { readPaneSession } from '#src/adapters/herdr-fleet.ts';
import type { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { TranscriptInFlight } from '#src/adapters/transcript-in-flight.ts';
import { LOCAL_REQUESTER } from '#src/ports/ask-ledger.ts';
import type { Ask, AskKey, AskLedger } from '#src/ports/ask-ledger.ts';
import type { HandoffAnswers, HandoffVerdict } from '#src/ports/handoff-answers.ts';
import type { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { HandoffRequestRow } from '#src/ports/requests.ts';
import { requestId } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import type { RequestId } from '#src/protocol/primitives.ts';
import { HandoffConfirmation } from '#src/recap/application/handoff-confirmation.ts';
import { HandoffFlow, unrendered } from '#src/recap/application/handoff-flow.ts';
import type { HandoffRun } from '#src/recap/application/handoff-flow.ts';
import type { HandoffRender } from '#src/recap/application/handoff-render.ts';
import { HandoffSender } from '#src/recap/application/handoff-sender.ts';
import type { LaneClaims } from '#src/recap/application/lane-claims.ts';
import { RECAP_WAIT_MS } from '#src/recap/application/recap-wait.ts';
import type { RecapJob } from '#src/recap/application/recap-job.ts';
import { TypingLease } from '#src/recap/application/typing-lease.ts';
import { HANDOFF_TAKE_MAX_AGE_MS } from '#src/recap/application/handoff-limits.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import { isStorable } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { awaitingNow } from './autocompact.ts';
import { refreshedWithin } from './refresh-status.ts';

export interface HandoffRunnerDeps {
    readonly flow: Pick<HandoffFlow, 'execute'>;
    readonly asks: AskLedger;
    readonly answers: HandoffAnswers;
    readonly transaction: <T>(work: () => T) => T;
    readonly now: () => number;
    readonly log: (line: string) => void;
}

const askIdOf = (id: HandoffId): RequestId | null => {
    const bytes = handoffBytesOf(id);
    return bytes === null ? null : must(requestId(Buffer.from(bytes).toString('hex').slice(-16), 'legacy-length'));
};

const handoffIdOfRef = (ref: string | null): HandoffId | null => (ref !== null && handoffBytesOf(ref as HandoffId) !== null ? (ref as HandoffId) : null);

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
        const id = handoffIdOfRef(ask.ref);
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
            this.finish(row.id, await this.deps.flow.execute(row).catch(internalError), key);
        } catch (error) {
            this.deps.log(`handoff ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private finish(id: HandoffId, run: HandoffRun, key: AskKey | null): void {
        const { asks, answers, transaction } = this.deps;
        const { outcome, rendered } = run;
        transaction(() => {
            answers.answerHandoff(id, verdictOf(outcome));
            if (key !== null) {
                asks.settle(key, settledOf(outcome));
            }
        });
        const reason = 'reason' in outcome ? ` ${outcome.reason}` : '';
        const text = rendered === null ? '' : ` bytes ${rendered.bytes} omitted ${rendered.omitted} withheld ${rendered.withheld}`;
        this.deps.log(`handoff ${id}: ${outcome.kind}${reason}${text}`);
    }
}

export interface HandoffWiring {
    readonly store: Store;
    readonly fleet: HerdrFleet;
    readonly transcripts: TranscriptRegistry;
    readonly claims: LaneClaims;
    readonly recaps: Pick<RecapJob, 'refreshNow'>;
    readonly board: () => Board;
    readonly pause: (ms: number) => Promise<void>;
    readonly log: (line: string) => void;
}

const now = (): number => Date.now();

const unbuiltRender: HandoffRender = (): Promise<never> => Promise.reject(new Error('the handoff content builder is not wired yet'));

export function wireHandoffs(parts: HandoffWiring): HandoffRunner {
    const { store, fleet, transcripts, claims, recaps, board, pause, log } = parts;
    const flow = new HandoffFlow({
        lanes: (): readonly Lane[] => [...board().lanes.values()], records: store.records, ledger: store.ledger,
        target: { plans: handoffPlans, inFlight: new TranscriptInFlight(transcripts), awaiting: awaitingNow },
        claims, refresh: (tab: string, lanes: readonly Lane[]): Promise<RefreshStatus> => refreshedWithin(recaps.refreshNow(tabId(tab), lanes), store.records, tab, RECAP_WAIT_MS),
        render: unbuiltRender,
        sender: new HandoffSender({
            agents: fleet.agents(),
            typing: new TypingLease({ tokens: fleet, panes: fleet, now, pause, log }),
            confirmation: new HandoffConfirmation({ agents: fleet.agents(), transcripts, session: readPaneSession, pause }),
        }),
        pause, now,
    });
    return new HandoffRunner({ flow, asks: store.asks, answers: store.handoffs, transaction: (work) => writeTx(store.db, work), now, log });
}
