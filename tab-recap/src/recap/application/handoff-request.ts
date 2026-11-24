import type { Text } from '#src/recap/domain/text.ts';
import type { Pid } from '#src/recap/domain/pid.ts';
import { duration, type Duration, type Instant } from '#src/recap/domain/time.ts';
import type { HandoffAnswerRecord, HandoffAnswerStore } from '#src/ports/handoff-answers.ts';
import type { HandoffAsker, RefreshFirst } from '#src/ports/requests.ts';
import type { TabViewStore } from '#src/ports/tab-views.ts';
import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import type { HandoffSource } from '#src/recap/domain/handoff-source.ts';
import { parseHandoffOutcome, type HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import { parseTabId, type HandoffId, type SessionKey, type ScopeId } from '#src/recap/domain/ids.ts';
import { HANDOFF_POLL_MS, HANDOFF_WAIT_MS, HANDOFF_WAIT_REFRESH_MS } from './handoff-limits.ts';

type Refusal = HandoffOutcome | null;

type Refresh = 'requested' | 'skipped';

export interface DeliverRequest {
    readonly from: SessionKey;
    readonly to: SessionKey;
    readonly note: Text | null;
    readonly refresh: RefreshFirst;
    readonly closed: ClosedLaneIdentity | null;
}

export interface Pacing {
    now(): Instant;
    sleep(span: Duration): Promise<void>;
}

export interface DaemonReading {
    readonly pid: Pid | null;
    readonly version: Text | null;
}

export interface HandoffStore {
    readonly views: Pick<TabViewStore, 'tabOf'>;
    readonly requests: HandoffAsker;
    readonly handoffs: Pick<HandoffAnswerStore, 'handoffAnswer'>;
    close(): void;
}

export interface DeliverDeps {
    readonly pacing: Pacing;
    readonly daemon: () => DaemonReading;
    readonly cliVersion: Text | null;
    readonly openStore: () => HandoffStore;
}

const refused = (reason: Extract<HandoffOutcome, { readonly kind: 'refused' }>['reason']): HandoffOutcome => ({ kind: 'refused', reason });

const failed = (reason: Extract<HandoffOutcome, { readonly kind: 'failed' }>['reason']): HandoffOutcome => ({ kind: 'failed', reason });

function outcomeOf(answer: HandoffAnswerRecord): HandoffOutcome {
    const parsed = parseHandoffOutcome(answer.kind, answer.reason);
    return parsed.kind === 'ok' ? parsed.value : failed('internal-error');
}

async function awaitAnswer(handoffs: HandoffStore['handoffs'], id: HandoffId, pacing: Pacing, wait: Duration): Promise<HandoffAnswerRecord | null> {
    const deadline = pacing.now() + wait;
    for (;;) {
        const answer = handoffs.handoffAnswer(id);
        if (answer !== null) {
            return answer;
        }
        const left = deadline - pacing.now();
        if (left <= 0) {
            return null;
        }
        await pacing.sleep(duration(Math.min(HANDOFF_POLL_MS, left)));
    }
}

function sourceOf(closed: ClosedLaneIdentity | null): HandoffSource {
    return closed === null ? { kind: 'live' } : { kind: 'closed', closedAt: closed.closedAt };
}

function refusedBeforeStore(request: DeliverRequest, deps: DeliverDeps): Refusal {
    if (request.closed === null && request.from === request.to) {
        return refused('source-equals-target');
    }
    const daemon = deps.daemon();
    if (daemon.pid === null) {
        return refused('daemon-not-running');
    }
    return deps.cliVersion === null || daemon.version !== deps.cliVersion ? refused('daemon-outdated') : null;
}

function tabOfRequest(request: DeliverRequest, store: HandoffStore): ScopeId | null {
    if (request.closed !== null) {
        return request.closed.tab;
    }
    const tab = parseTabId(store.views.tabOf(request.from));
    return tab.kind === 'ok' ? tab.value : null;
}

async function settledOutcome(id: HandoffId, store: HandoffStore, deps: DeliverDeps, refresh: Refresh): Promise<HandoffOutcome> {
    const answer = await awaitAnswer(store.handoffs, id, deps.pacing, refresh === 'requested' ? duration(HANDOFF_WAIT_REFRESH_MS) : duration(HANDOFF_WAIT_MS));
    if (answer !== null) {
        return outcomeOf(answer);
    }
    if (store.requests.withdrawHandoff(id) === 'withdrawn') {
        return failed('not-answered-withdrawn');
    }
    const late = store.handoffs.handoffAnswer(id);
    return late === null ? failed('not-answered-taken') : outcomeOf(late);
}

function queuedOf(request: DeliverRequest, store: HandoffStore, tab: ScopeId): HandoffId {
    return store.requests.requestHandoff({ tab, pane: request.from, toPane: request.to, note: request.note, refresh: request.refresh, source: sourceOf(request.closed) });
}

export async function deliverHandoff(request: DeliverRequest, deps: DeliverDeps): Promise<HandoffOutcome> {
    const refusal = refusedBeforeStore(request, deps);
    if (refusal !== null) {
        return refusal;
    }
    const store = deps.openStore();
    try {
        const tab = tabOfRequest(request, store);
        if (tab === null) {
            return refused('source-unavailable');
        }
        return await settledOutcome(queuedOf(request, store, tab), store, deps, request.refresh === 'refresh-first' ? 'requested' : 'skipped');
    } finally {
        store.close();
    }
}
