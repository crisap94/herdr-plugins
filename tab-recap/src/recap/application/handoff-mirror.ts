import type { AskKey, AskLedger } from '#src/ports/ask-ledger.ts';
import type { HandoffRequestRow } from '#src/ports/requests.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { handoff, HANDOFF_EVENTS, HANDOFF_STAGES } from '#src/protocol/exchanges/handoff.ts';
import { failureStage, terminalStage } from '#src/protocol/exchange.ts';
import { requestId } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { answer as answerOf } from '#src/protocol/responder.ts';
import type { TokenWrite } from '#src/protocol/tokens.ts';
import type { EventKind } from '#src/recap/domain/event-token.ts';
import type { HerdrEvents } from '#src/recap/domain/herdr-events.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import { storedOutcomeOf } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import { failureCauseOf } from '#src/recap/domain/failure-cause.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { LaneEvents } from './lane-events.ts';
import { HANDOFF_ANSWER_TTL_MS } from './handoff-limits.ts';

export type HandoffLog = (line: Text) => void;

export interface Route {
    readonly source: PaneId;
    readonly target: PaneId;
    readonly id: Text;
}

const STAGE = {
    queued: must(parseText(HANDOFF_STAGES.queued)),
    running: must(parseText(HANDOFF_STAGES.running)),
    delivered: must(parseText(HANDOFF_STAGES.delivered)),
    internal: must(parseText(failureStage('internal-error'))),
};

export function handoffStageOf(outcome: HandoffOutcome): Text {
    if (outcome.kind === 'delivered') {
        return STAGE.delivered;
    }
    const stored = 'reason' in outcome ? storedOutcomeOf(outcome.kind, outcome.reason) : null;
    if (stored === null || stored.kind === 'delivered') {
        return STAGE.internal;
    }
    return must(parseText(terminalStage({ kind: stored.kind, reason: stored.reason })));
}

export interface HandoffMirrorDeps {
    readonly asks: AskLedger;
    readonly tokens: LaneTokens;
    readonly events: LaneEvents;
    readonly sharing: () => HerdrEvents;
    readonly log: HandoffLog;
}

export const askKeyOf = (route: Route): AskKey => ({ exchange: HANDOFF_EXCHANGE, id: must(requestId(route.id, 'token-safe')), pane: route.source });

export async function reportWrite(tokens: LaneTokens, log: HandoffLog, pane: PaneId, write: TokenWrite): Promise<void> {
    try {
        const done = await tokens.report(pane, { [write.name]: write.value }, HANDOFF_ANSWER_TTL_MS);
        if (isUnknown(done)) {
            log(must(parseText(`handoff answer on ${pane}: not written (${saying(done.why)})`)));
        }
    } catch (error) {
        log(must(parseText(`handoff answer on ${pane}: not written (${failureCauseOf(error)})`)));
    }
}

export class HandoffMirror {
    private readonly deps: HandoffMirrorDeps;
    private readonly pending = new Map<PaneId, Promise<void>>();

    constructor(deps: HandoffMirrorDeps) {
        this.deps = deps;
    }

    routeOf(row: HandoffRequestRow): Route | null {
        const ask = this.deps.asks.unfinished().find((each) => each.exchange === HANDOFF_EXCHANGE && each.ref === row.id);
        return ask === undefined ? null : { source: row.pane, target: row.toPane, id: must(parseText(ask.id)) };
    }

    queued(route: Route): void {
        this.advance(route, STAGE.queued, HANDOFF_EVENTS.queued);
    }

    running(route: Route): void {
        this.advance(route, STAGE.running, HANDOFF_EVENTS.running);
    }

    terminal(route: Route, outcome: HandoffOutcome): void {
        this.advance(route, handoffStageOf(outcome), outcome.kind === 'delivered' ? HANDOFF_EVENTS.delivered : HANDOFF_EVENTS.failed);
    }

    private advance(route: Route, stage: Text, kind: EventKind): void {
        if (this.deps.sharing() !== 'on') {
            return;
        }
        const write = answerOf(handoff, must(requestId(route.id, 'token-safe')), stage);
        if (write.kind === 'ok') {
            this.report(route.source, write.value);
        }
        const detail = kind === HANDOFF_EVENTS.failed ? must(parseText(`${route.id}:${stage}`)) : route.id;
        this.deps.events.lane(route.source, kind, detail);
        this.deps.events.lane(route.target, kind, detail);
    }

    private report(pane: PaneId, write: TokenWrite): void {
        const { tokens, log } = this.deps;
        const previous = this.pending.get(pane);
        const next = previous === undefined ? reportWrite(tokens, log, pane, write) : previous.then(() => reportWrite(tokens, log, pane, write));
        this.pending.set(pane, next);
        void next.then(() => {
            if (this.pending.get(pane) === next) {
                this.pending.delete(pane);
            }
        });
    }
}
