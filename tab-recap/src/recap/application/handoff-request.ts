import type { HandoffAnswerRow, HandoffAnswers } from '#src/ports/handoff-answers.ts';
import type { HandoffRequester } from '#src/ports/requests.ts';
import type { TabViews } from '#src/ports/tab-views.ts';
import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { HandoffSource } from '#src/recap/domain/handoff-source.ts';
import { handoffOutcomeOf, type HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import { tabId, type HandoffId, type PaneId } from '#src/recap/domain/ids.ts';
import { HANDOFF_POLL_MS, HANDOFF_WAIT_MS, HANDOFF_WAIT_REFRESH_MS } from './handoff-limits.ts';

export interface DeliverRequest {
    readonly from: PaneId;
    readonly to: PaneId;
    readonly note: string | null;
    readonly refresh: boolean;
    readonly closed: ClosedLaneIdentity | null;
}

export interface Pacing {
    now(): number;
    sleep(ms: number): Promise<void>;
}

export interface DaemonReading {
    readonly pid: number | null;
    readonly version: string | null;
}

export interface HandoffStore {
    readonly views: Pick<TabViews, 'tabOf'>;
    readonly requests: HandoffRequester;
    readonly handoffs: Pick<HandoffAnswers, 'handoffAnswer'>;
    close(): void;
}

export interface DeliverDeps {
    readonly pacing: Pacing;
    readonly daemon: () => DaemonReading;
    readonly cliVersion: string | null;
    readonly openStore: () => HandoffStore;
}

const refused = (reason: Extract<HandoffOutcome, { readonly kind: 'refused' }>['reason']): HandoffOutcome => ({ kind: 'refused', reason });

const failed = (reason: Extract<HandoffOutcome, { readonly kind: 'failed' }>['reason']): HandoffOutcome => ({ kind: 'failed', reason });

function outcomeOf(answer: HandoffAnswerRow): HandoffOutcome {
    return handoffOutcomeOf(answer.outcome, answer.reason) ?? failed('internal-error');
}

async function awaitAnswer(handoffs: HandoffStore['handoffs'], id: HandoffId, pacing: Pacing, waitMs: number): Promise<HandoffAnswerRow | null> {
    const deadline = pacing.now() + waitMs;
    for (;;) {
        const answer = handoffs.handoffAnswer(id);
        if (answer !== null) {
            return answer;
        }
        const left = deadline - pacing.now();
        if (left <= 0) {
            return null;
        }
        await pacing.sleep(Math.min(HANDOFF_POLL_MS, left));
    }
}

function sourceOf(closed: ClosedLaneIdentity | null): HandoffSource {
    return closed === null ? { kind: 'live' } : { kind: 'closed', closedAt: closed.closedAt };
}

export async function deliverHandoff(request: DeliverRequest, deps: DeliverDeps): Promise<HandoffOutcome> {
    if (request.closed === null && request.from === request.to) {
        return refused('source-equals-target');
    }
    const daemon = deps.daemon();
    if (daemon.pid === null) {
        return refused('daemon-not-running');
    }
    if (deps.cliVersion === null || daemon.version !== deps.cliVersion) {
        return refused('daemon-outdated');
    }
    const store = deps.openStore();
    try {
        const tab = request.closed === null ? store.views.tabOf(request.from) : String(request.closed.tab);
        if (tab === null) {
            return refused('source-unavailable');
        }
        const id = store.requests.requestHandoff({ tab: tabId(tab), pane: request.from, toPane: request.to, note: request.note, refreshFirst: request.refresh, source: sourceOf(request.closed) });
        const answer = await awaitAnswer(store.handoffs, id, deps.pacing, request.refresh ? HANDOFF_WAIT_REFRESH_MS : HANDOFF_WAIT_MS);
        if (answer !== null) {
            return outcomeOf(answer);
        }
        if (store.requests.withdrawHandoff(id)) {
            return failed('not-answered-withdrawn');
        }
        const late = store.handoffs.handoffAnswer(id);
        return late === null ? failed('not-answered-taken') : outcomeOf(late);
    } finally {
        store.close();
    }
}
