import type { AgentPanes, PromptStance, Prompted } from '#src/ports/agents.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import { failureCauseOf, parseThrown } from '@stateforge-labs/session-ledger';
import type { Acquired } from './typing-lease.ts';
import type { HandoffConfirmation } from './handoff-confirmation.ts';
import type { Ready } from './handoff-target.ts';
import { withTypingLease } from './typing-scope.ts';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import { parseMilliseconds, type Milliseconds } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { textOf, type Text } from '@stateforge-labs/session-ledger';

export interface HandoffTyping {
    acquire(pane: SessionKey, waitMs: Milliseconds): Promise<Acquired>;
    release(pane: SessionKey): Promise<void>;
}

export interface HandoffSenderDeps {
    readonly agents: Pick<AgentPanes, 'prompt'>;
    readonly typing: HandoffTyping;
    readonly confirmation: HandoffConfirmation;
    readonly log: (line: Text) => void;
}

const NO_WAIT = must(parseMilliseconds(0));

const NO_STALL: PromptStance = { stall: 'refuses-stall' };

export class HandoffSender {
    private readonly deps: HandoffSenderDeps;

    constructor(deps: HandoffSenderDeps) {
        this.deps = deps;
    }

    async send(target: Ready, text: Text): Promise<HandoffOutcome> {
        const { pane } = target.lane;
        const { typing } = this.deps;
        const leased = await withTypingLease({ acquire: () => typing.acquire(pane, NO_WAIT), release: () => typing.release(pane) }, () => this.prompted(target, text));
        return leased.kind === 'busy' ? { kind: 'refused', reason: 'typing-lease-busy' } : leased.value;
    }

    private async prompted(target: Ready, text: Text): Promise<HandoffOutcome> {
        const baseline = await this.deps.confirmation.baseline(target);
        let sent: Prompted;
        try {
            sent = await this.deps.agents.prompt(target.lane.pane, text, undefined, NO_STALL);
        } catch (error) {
            this.deps.log(textOf(`handoff prompt ${target.lane.pane}: ${failureCauseOf(parseThrown(error))}`));
            return { kind: 'failed', reason: 'transport' };
        }
        if (sent.kind === 'blocked') {
            return { kind: 'refused', reason: 'status-not-ready' };
        }
        if (sent.kind !== 'sent') {
            return { kind: 'failed', reason: 'transport' };
        }
        return this.deps.confirmation.confirm(target, baseline, text);
    }
}
