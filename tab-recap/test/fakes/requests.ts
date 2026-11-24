import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import type { AnsweredPane, CompactAsk, HandoffAskRecord, HandoffAsk, RequestPort, VisibilityAsk, Withdrawal } from '#src/ports/requests.ts';
import type { HandoffId, ScopeId } from '#src/recap/domain/ids.ts';
import { instant } from '@stateforge-labs/session-ledger';

export class MemoryRequests implements RequestPort {
    private readonly now: () => number;
    private refreshes: ScopeId[] = [];
    private curations: ScopeId[] = [];
    private visibilities: VisibilityAsk[] = [];
    private compactions: CompactAsk[] = [];
    private handoffs: HandoffAskRecord[] = [];

    constructor(now: () => number = Date.now) {
        this.now = now;
    }

    request(tab: ScopeId): void {
        this.refreshes.push(tab);
    }

    requestVisibility(request: VisibilityAsk): void {
        this.visibilities.push(request);
    }

    requestCompact(request: CompactAsk): void {
        this.compactions.push(request);
    }

    requestCurate(tab: ScopeId): void {
        this.curations.push(tab);
    }

    requestHandoff(request: HandoffAsk): HandoffId {
        const id = handoffIdOf(ids.next());
        this.handoffs.push({ id, at: instant(this.now()), ...request });
        return id;
    }

    withdrawHandoff(id: HandoffId): Withdrawal {
        const before = this.handoffs.length;
        this.handoffs = this.handoffs.filter((row) => row.id !== id);
        return this.handoffs.length < before ? 'withdrawn' : 'not-found';
    }

    takeRequests(): readonly ScopeId[] {
        const taken = [...new Set(this.refreshes)];
        this.refreshes = [];
        return taken;
    }

    takeVisibility(): readonly VisibilityAsk[] {
        const taken = this.visibilities;
        this.visibilities = [];
        return taken;
    }

    takeCompactions(): readonly CompactAsk[] {
        const taken = this.compactions;
        this.compactions = [];
        return taken;
    }

    takeCurations(): readonly ScopeId[] {
        const taken = [...new Set(this.curations)];
        this.curations = [];
        return taken;
    }

    takeAnswered(): readonly AnsweredPane[] {
        const answered = this.compactions.filter((request) => request.answer !== undefined);
        this.compactions = this.compactions.filter((request) => request.answer === undefined);
        return answered.flatMap((request) => (request.pane === null || request.answer === undefined ? [] : [{ pane: request.pane, answer: request.answer }]));
    }

    takeHandoffs(): readonly HandoffAskRecord[] {
        const taken = this.handoffs;
        this.handoffs = [];
        return taken;
    }
}
