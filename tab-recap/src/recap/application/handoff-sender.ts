import type { Agents, Prompted } from '#src/ports/agents.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import { failureCauseOf } from '#src/recap/domain/failure-cause.ts';
import type { Acquired } from './typing-lease.ts';
import type { HandoffConfirmation } from './handoff-confirmation.ts';
import type { Ready } from './handoff-target.ts';
import { withTypingLease } from './typing-scope.ts';

export interface HandoffTyping {
    acquire(pane: string, waitMs: number): Promise<Acquired>;
    release(pane: string): Promise<void>;
}

export interface HandoffSenderDeps {
    readonly agents: Pick<Agents, 'prompt'>;
    readonly typing: HandoffTyping;
    readonly confirmation: HandoffConfirmation;
    readonly log: (line: string) => void;
}

const NO_STALL = { acceptsStall: false };

export class HandoffSender {
    private readonly deps: HandoffSenderDeps;

    constructor(deps: HandoffSenderDeps) {
        this.deps = deps;
    }

    async send(target: Ready, text: string): Promise<HandoffOutcome> {
        const pane = String(target.lane.pane);
        const { typing } = this.deps;
        const leased = await withTypingLease({ acquire: () => typing.acquire(pane, 0), release: () => typing.release(pane) }, () => this.prompted(target, text));
        return leased.kind === 'busy' ? { kind: 'refused', reason: 'typing-lease-busy' } : leased.value;
    }

    private async prompted(target: Ready, text: string): Promise<HandoffOutcome> {
        const baseline = await this.deps.confirmation.baseline(target);
        let sent: Prompted;
        try {
            sent = await this.deps.agents.prompt(String(target.lane.pane), text, undefined, NO_STALL);
        } catch (error) {
            this.deps.log(`handoff prompt ${target.lane.pane}: ${failureCauseOf(error)}`);
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
