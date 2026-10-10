import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import type { CompactRequest, HandoffRequestRow, NewHandoffRequest, Requests, VisibilityRequest } from '#src/ports/requests.ts';
import type { HandoffId, TabId } from '#src/recap/domain/ids.ts';

export class MemoryRequests implements Requests {
    private readonly now: () => number;
    private refreshes: TabId[] = [];
    private curations: TabId[] = [];
    private visibilities: VisibilityRequest[] = [];
    private compactions: CompactRequest[] = [];
    private handoffs: HandoffRequestRow[] = [];

    constructor(now: () => number = Date.now) {
        this.now = now;
    }

    request(tab: string): void {
        this.refreshes.push(tab as TabId);
    }

    requestVisibility(request: VisibilityRequest): void {
        this.visibilities.push(request);
    }

    requestCompact(request: CompactRequest): void {
        this.compactions.push(request);
    }

    requestCurate(tab: string): void {
        this.curations.push(tab as TabId);
    }

    requestHandoff(request: NewHandoffRequest): HandoffId {
        const id = handoffIdOf(ids.next());
        this.handoffs.push({ id, at: this.now(), ...request });
        return id;
    }

    withdrawHandoff(id: HandoffId): boolean {
        const before = this.handoffs.length;
        this.handoffs = this.handoffs.filter((row) => row.id !== id);
        return this.handoffs.length < before;
    }

    takeRequests(): readonly TabId[] {
        const taken = [...new Set(this.refreshes)];
        this.refreshes = [];
        return taken;
    }

    takeVisibility(): readonly VisibilityRequest[] {
        const taken = this.visibilities;
        this.visibilities = [];
        return taken;
    }

    takeCompactions(): readonly CompactRequest[] {
        const taken = this.compactions;
        this.compactions = [];
        return taken;
    }

    takeCurations(): readonly TabId[] {
        const taken = [...new Set(this.curations)];
        this.curations = [];
        return taken;
    }

    takeAnswered(): readonly { readonly pane: string; readonly answer: string }[] {
        const answered = this.compactions.filter((request) => request.answer !== undefined);
        this.compactions = this.compactions.filter((request) => request.answer === undefined);
        return answered.flatMap((request) => (request.pane === null || request.answer === undefined ? [] : [{ pane: request.pane, answer: request.answer }]));
    }

    takeHandoffs(): readonly HandoffRequestRow[] {
        const taken = this.handoffs;
        this.handoffs = [];
        return taken;
    }
}
