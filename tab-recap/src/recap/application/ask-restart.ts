import { LOCAL_REQUESTER } from '#src/ports/ask-ledger.ts';
import type { AskEntry, AskBook } from '#src/ports/ask-ledger.ts';
import type { CompactionLog } from '#src/ports/compaction-records.ts';
import type { LaneTokenReporter } from '#src/ports/lane-tokens.ts';
import type { RequestPort } from '#src/ports/requests.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { failureStage, INTERRUPTED_REASON } from '#src/protocol/exchange.ts';
import type { Exchange } from '#src/protocol/exchange.ts';
import { must } from '#src/protocol/result.ts';
import type { TokenWrite } from '#src/protocol/tokens.ts';
import { parseWireText, refuse } from '#src/protocol/primitives.ts';
import { answerWrite } from '#src/protocol/responder.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { ANSWER_TTL_MS } from '#src/recap/domain/compact-request.ts';
import { uncheckedMilliseconds } from '#src/recap/domain/ids.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';

export interface RestartWiring {
    readonly exchanges: readonly Exchange[];
    readonly ledger: AskBook;
    readonly requests: Pick<RequestPort, 'takeAnswered'>;
    readonly compactions: Pick<CompactionLog, 'interrupted'>;
    readonly tokens: Pick<LaneTokenReporter, 'report'>;
    readonly enabled: () => Presence;
    readonly local: (ask: AskEntry) => void;
    readonly handoff: (ask: AskEntry) => void;
    readonly withdraw: (ask: AskEntry) => void;
    readonly log: (line: Text) => void;
    readonly now: () => Instant;
    readonly restartedWhy: Text;
}

const ANSWER_TTL = uncheckedMilliseconds(ANSWER_TTL_MS);
const INTERRUPTED: AskOutcome = { kind: 'interrupted' };
const FAILED_INTERRUPTED: AskOutcome = { kind: 'failed', reason: INTERRUPTED_REASON };

export function purgeAnsweredCompactions(requests: Pick<RequestPort, 'takeAnswered'>): Count {
    return must(parseCount(requests.takeAnswered().length));
}

async function sendAnswer(deps: RestartWiring, pane: SessionKey, write: TokenWrite): Promise<void> {
    const done = await deps.tokens.report(pane, new Map([[write.name, write.value]]), ANSWER_TTL);
    if (isUnknown(done)) {
        deps.log(must(parseText(`ask on ${pane}: not answered (${saying(done.why)})`)));
    }
}

function answerInterrupted(deps: RestartWiring, ask: AskEntry): void {
    const exchange = deps.exchanges.find((each) => each.name === ask.exchange);
    if (exchange === undefined) {
        deps.log(must(parseText(`ask ${ask.id} of ${ask.exchange}: interrupted; no exchange of that name is answered here`)));
        deps.ledger.settle(ask, INTERRUPTED);
        return;
    }
    deps.ledger.settle(ask, FAILED_INTERRUPTED);
    const stage = parseWireText(failureStage(INTERRUPTED_REASON));
    const write = stage.kind === 'err' ? refuse(stage.error, 'TokenValue') : answerWrite(exchange, ask.id, stage.value);
    if (write.kind === 'ok' && deps.enabled() === 'present') {
        void sendAnswer(deps, ask.pane, write.value);
    }
}

export function restartAnswers(deps: RestartWiring): Count {
    const purged = purgeAnsweredCompactions(deps.requests);
    if (purged > 0) {
        deps.log(must(parseText(`restart: ${purged} answered compaction request(s) purged`)));
    }
    const restarted = deps.compactions.interrupted(deps.now(), deps.restartedWhy);
    for (const ask of deps.ledger.unfinished()) {
        if (ask.requester === LOCAL_REQUESTER && ask.exchange === HANDOFF_EXCHANGE) {
            deps.handoff(ask);
        } else if (ask.requester === LOCAL_REQUESTER) {
            deps.local(ask);
            deps.ledger.settle(ask, INTERRUPTED);
        } else {
            if (ask.exchange === HANDOFF_EXCHANGE) {
                deps.withdraw(ask);
            }
            answerInterrupted(deps, ask);
        }
    }
    return restarted;
}
