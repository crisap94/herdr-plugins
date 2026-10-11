import { LOCAL_REQUESTER } from '#src/ports/ask-ledger.ts';
import type { Ask, AskLedger } from '#src/ports/ask-ledger.ts';
import type { CompactionRecords } from '#src/ports/compaction-records.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { Requests } from '#src/ports/requests.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { failureStage, INTERRUPTED_REASON } from '#src/protocol/exchange.ts';
import type { Exchange } from '#src/protocol/exchange.ts';
import type { TokenWrite } from '#src/protocol/tokens.ts';
import { answer } from '#src/protocol/responder.ts';
import type { AskOutcome } from '#src/recap/domain/ask-outcome.ts';
import { ANSWER_TTL_MS } from '#src/recap/domain/compact-request.ts';

export interface RestartDeps {
    readonly exchanges: readonly Exchange[];
    readonly ledger: AskLedger;
    readonly requests: Pick<Requests, 'takeAnswered'>;
    readonly compactions: Pick<CompactionRecords, 'interrupted'>;
    readonly tokens: Pick<LaneTokens, 'report'>;
    readonly enabled: () => boolean;
    readonly local: (ask: Ask) => void;
    readonly log: (line: string) => void;
    readonly now: () => number;
    readonly restartedWhy: string;
}

const INTERRUPTED: AskOutcome = { kind: 'interrupted' };
const FAILED_INTERRUPTED: AskOutcome = { kind: 'failed', reason: INTERRUPTED_REASON };

export function purgeAnsweredCompactions(requests: Pick<Requests, 'takeAnswered'>): number {
    return requests.takeAnswered().length;
}

async function sendAnswer(deps: RestartDeps, pane: string, write: TokenWrite): Promise<void> {
    const done = await deps.tokens.report(pane, { [write.name]: write.value }, ANSWER_TTL_MS);
    if (isUnknown(done)) {
        deps.log(`ask on ${pane}: not answered (${saying(done.why)})`);
    }
}

function answerInterrupted(deps: RestartDeps, ask: Ask): void {
    const exchange = deps.exchanges.find((each) => each.name === ask.exchange);
    if (exchange === undefined) {
        deps.log(`ask ${ask.id} of ${ask.exchange}: interrupted; no exchange of that name is answered here`);
        deps.ledger.settle(ask, INTERRUPTED);
        return;
    }
    deps.ledger.settle(ask, FAILED_INTERRUPTED);
    const write = answer(exchange, ask.id, failureStage(INTERRUPTED_REASON));
    if (write.kind === 'ok' && deps.enabled()) {
        void sendAnswer(deps, ask.pane, write.value);
    }
}

export function answerRestart(deps: RestartDeps): number {
    const purged = purgeAnsweredCompactions(deps.requests);
    if (purged > 0) {
        deps.log(`restart: ${purged} answered compaction request(s) purged`);
    }
    const restarted = deps.compactions.interrupted(deps.now(), deps.restartedWhy);
    for (const ask of deps.ledger.unfinished()) {
        if (ask.requester === LOCAL_REQUESTER) {
            deps.local(ask);
            deps.ledger.settle(ask, INTERRUPTED);
        } else {
            answerInterrupted(deps, ask);
        }
    }
    return restarted;
}
