import type { Store } from '#src/adapters/db/database.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import { HandoffExchangeResponder } from '#src/recap/application/handoff-exchange.ts';
import { HandoffMirror, type HandoffLog } from '#src/recap/application/handoff-mirror.ts';
import type { LaneEvents } from '#src/recap/application/lane-events.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { HandoffOffer } from '#src/recap/domain/handoff-ask.ts';
import type { HandoffRequests } from '#src/recap/domain/handoff-requests.ts';
import type { HerdrEvents } from '#src/recap/domain/herdr-events.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';

export interface HandoffExchangeParts {
    readonly store: Pick<Store, 'asks' | 'requests'>;
    readonly tokens: LaneTokens;
    readonly events: LaneEvents;
    readonly board: () => Board;
    readonly sharing: () => HerdrEvents;
    readonly requests: () => HandoffRequests;
    readonly log: HandoffLog;
}

export interface HandoffExchangeWiring {
    readonly mirror: HandoffMirror;
    readonly responder: HandoffExchangeResponder;
}

const offerOf = (sharing: HerdrEvents, requests: HandoffRequests): HandoffOffer => {
    if (sharing === 'off') {
        return 'sharing-off';
    }
    return requests === 'on' ? 'offered' : 'not-offered';
};

export function handoffExchangeOf(parts: HandoffExchangeParts): HandoffExchangeWiring {
    const mirror = new HandoffMirror({ asks: parts.store.asks, tokens: parts.tokens, events: parts.events, sharing: parts.sharing, log: parts.log });
    const responder = new HandoffExchangeResponder({ offer: (): HandoffOffer => offerOf(parts.sharing(), parts.requests()), board: parts.board, requests: parts.store.requests, asks: parts.store.asks, mirror, tokens: parts.tokens, now: (): Instant => instant(Date.now()), log: parts.log });
    return { mirror, responder };
}
