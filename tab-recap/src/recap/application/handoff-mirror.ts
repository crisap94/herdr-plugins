import type { AskKey, AskLedger } from '#src/ports/ask-ledger.ts';
import type { HandoffRequestRow } from '#src/ports/requests.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { handoff, HANDOFF_EVENTS, HANDOFF_STAGES } from '#src/protocol/exchanges/handoff.ts';
import { failureStage, terminalStage } from '#src/protocol/exchange.ts';
import type { RequestId } from '#src/protocol/primitives.ts';
import { answer as answerOf } from '#src/protocol/responder.ts';
import type { TokenWrite } from '#src/protocol/tokens.ts';
import type { EventKind } from '#src/recap/domain/event-token.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import { storedOutcomeOf } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import type { LaneEvents } from './lane-events.ts';
import { HANDOFF_ANSWER_TTL_MS } from './handoff-limits.ts';

export interface Route {
    readonly source: PaneId;
    readonly target: PaneId;
    readonly id: RequestId;
}

export function handoffStageOf(outcome: HandoffOutcome): string {
    if (outcome.kind === 'delivered') {
        return HANDOFF_STAGES.delivered;
    }
    const stored = 'reason' in outcome ? storedOutcomeOf(outcome.kind, outcome.reason) : null;
    if (stored === null || stored.kind === 'delivered') {
        return failureStage('internal-error');
    }
    return terminalStage({ kind: stored.kind, reason: stored.reason });
}

export interface HandoffMirrorDeps {
    readonly asks: AskLedger;
    readonly tokens: LaneTokens;
    readonly events: LaneEvents;
    readonly sharing: () => boolean;
    readonly log: (line: string) => void;
}

export const askKeyOf = (route: Route): AskKey => ({ exchange: HANDOFF_EXCHANGE, id: route.id, pane: route.source });

export function reportWrite(tokens: LaneTokens, log: (line: string) => void, pane: PaneId, write: TokenWrite): void {
    void tokens.report(pane, { [write.name]: write.value }, HANDOFF_ANSWER_TTL_MS).then((done) => {
        if (isUnknown(done)) {
            log(`handoff answer on ${pane}: not written (${saying(done.why)})`);
        }
    });
}

export class HandoffMirror {
    private readonly deps: HandoffMirrorDeps;

    constructor(deps: HandoffMirrorDeps) {
        this.deps = deps;
    }

    routeOf(row: HandoffRequestRow): Route | null {
        const ask = this.deps.asks.unfinished().find((each) => each.exchange === HANDOFF_EXCHANGE && each.ref === row.id);
        return ask === undefined ? null : { source: row.pane, target: row.toPane, id: ask.id };
    }

    queued(route: Route): void {
        this.advance(route, HANDOFF_STAGES.queued, HANDOFF_EVENTS.queued);
    }

    running(route: Route): void {
        this.advance(route, HANDOFF_STAGES.running, HANDOFF_EVENTS.running);
    }

    terminal(route: Route, outcome: HandoffOutcome): void {
        this.advance(route, handoffStageOf(outcome), outcome.kind === 'delivered' ? HANDOFF_EVENTS.delivered : HANDOFF_EVENTS.failed);
    }

    private advance(route: Route, stage: string, kind: EventKind): void {
        if (!this.deps.sharing()) {
            return;
        }
        const write = answerOf(handoff, route.id, stage);
        if (write.kind === 'ok') {
            reportWrite(this.deps.tokens, this.deps.log, route.source, write.value);
        }
        const detail = kind === HANDOFF_EVENTS.failed ? `${route.id}:${stage}` : route.id;
        this.deps.events.lane(route.source, kind, detail);
        this.deps.events.lane(route.target, kind, detail);
    }
}
