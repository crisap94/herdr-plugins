import type { HandoffRequestRow } from '#src/ports/requests.ts';
import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { failureCauseOf } from '#src/recap/domain/failure-cause.ts';
import type { LaneClaims } from './lane-claims.ts';
import type { HandoffRender, HandoffRenderResult, RenderMetrics } from './handoff-render.ts';
import type { HandoffSender } from './handoff-sender.ts';
import { isLaneOfTab, resolveSource } from './handoff-source.ts';
import { DeliveryMark } from './delivery-mark.ts';
import type { SourceDeps, SourceResolution } from './handoff-source.ts';
import { resolveTarget } from './handoff-target.ts';
import type { Ready, TargetDeps, TargetResolution } from './handoff-target.ts';

export interface HandoffFlowDeps {
    readonly lanes: () => readonly Lane[];
    readonly records: SourceDeps['records'];
    readonly ledger: SourceDeps['ledger'];
    readonly target: Omit<TargetDeps, 'lanes'>;
    readonly claims: Pick<LaneClaims, 'has' | 'claimAll' | 'release'>;
    readonly refresh: (tab: string, lanes: readonly Lane[]) => Promise<RefreshStatus>;
    readonly render: HandoffRender;
    readonly sender: Pick<HandoffSender, 'send'>;
    readonly pause: (ms: number) => Promise<void>;
    readonly now: () => number;
    readonly log: (line: string) => void;
}

export interface HandoffRun {
    readonly outcome: HandoffOutcome;
    readonly rendered: RenderMetrics | null;
}

export const unrendered = (outcome: HandoffOutcome): HandoffRun => ({ outcome, rendered: null });

export class HandoffFlow {
    private readonly deps: HandoffFlowDeps;

    constructor(deps: HandoffFlowDeps) {
        this.deps = deps;
    }

    async run(request: HandoffRequestRow): Promise<HandoffOutcome> {
        return (await this.execute(request)).outcome;
    }

    async execute(request: HandoffRequestRow, mark: DeliveryMark = new DeliveryMark()): Promise<HandoffRun> {
        try {
            return await this.steps(request, mark);
        } catch (error) {
            this.deps.log(`handoff ${request.id}: ${failureCauseOf(error)}`);
            return unrendered({ kind: 'failed', reason: 'internal-error' });
        }
    }

    private async steps(request: HandoffRequestRow, mark: DeliveryMark): Promise<HandoffRun> {
        if (request.pane === request.toPane) {
            return unrendered({ kind: 'refused', reason: 'source-equals-target' });
        }
        const early = await this.early(request);
        if (early.kind !== 'ready') {
            return unrendered(early);
        }
        const refresh = request.refreshFirst ? await this.refreshed(request.tab) : 'not-requested';
        const rendered = await this.rendered(request, refresh);
        if (rendered.kind !== 'text') {
            return unrendered(rendered);
        }
        const [sourcePane, targetPane] = [String(request.pane), String(request.toPane)];
        if (!this.deps.claims.claimAll([{ pane: sourcePane, kind: 'handoff' }, { pane: targetPane, kind: 'handoff' }])) {
            return unrendered({ kind: 'refused', reason: 'lane-busy' });
        }
        if (!mark.claim()) {
            this.deps.claims.release(sourcePane);
            this.deps.claims.release(targetPane);
            return unrendered({ kind: 'failed', reason: 'expired' });
        }
        try {
            return { outcome: await this.deliver(request, rendered.text, mark), rendered: { bytes: rendered.bytes, omitted: rendered.omitted, withheld: rendered.withheld } };
        } finally {
            if (mark.settle()) {
                this.deps.claims.release(sourcePane);
                this.deps.claims.release(targetPane);
            }
        }
    }

    private async early(request: HandoffRequestRow): Promise<Ready | HandoffOutcome> {
        const lanes = this.deps.lanes();
        if (!isLaneOfTab(lanes, { tab: request.tab, pane: request.pane })) {
            return { kind: 'refused', reason: 'source-unavailable' };
        }
        const target = await this.resolve(request);
        if (target.kind !== 'ready') {
            return target;
        }
        if (this.deps.claims.has(String(request.pane)) || this.deps.claims.has(String(request.toPane))) {
            return { kind: 'refused', reason: 'lane-busy' };
        }
        return target;
    }

    private resolve(request: HandoffRequestRow): Promise<TargetResolution> {
        return resolveTarget(request.pane, request.toPane, { ...this.deps.target, lanes: this.deps.lanes() });
    }

    private async refreshed(tab: TabId): Promise<RefreshStatus> {
        try {
            return await this.deps.refresh(String(tab), this.deps.lanes().filter((lane) => lane.tab === tab));
        } catch (error) {
            this.deps.log(`handoff refresh ${tab}: ${failureCauseOf(error)}`);
            return 'failed';
        }
    }

    private async rendered(request: HandoffRequestRow, refresh: RefreshStatus): Promise<HandoffRenderResult | HandoffOutcome> {
        const found: SourceResolution = resolveSource('live', { tab: request.tab, pane: request.pane }, { lanes: this.deps.lanes(), records: this.deps.records, ledger: this.deps.ledger, now: this.deps.now() });
        switch (found.kind) {
            case 'found':
                return this.renderOf(request, found.facts, refresh);
            case 'unlisted':
                return { kind: 'refused', reason: 'ledger-empty' };
            case 'task-ambiguous':
                return { kind: 'refused', reason: 'task-ambiguous' };
            case 'source-unavailable':
                return { kind: 'refused', reason: 'source-unavailable' };
            case 'unknown':
                return { kind: 'failed', reason: 'source-unreadable' };
            default: {
                const exhaustive: never = found;
                return exhaustive;
            }
        }
    }

    private renderOf(request: HandoffRequestRow, facts: readonly Fact[], refresh: RefreshStatus): Promise<HandoffRenderResult> | HandoffOutcome {
        const lane = this.deps.lanes().find((candidate) => candidate.pane === request.pane);
        if (lane === undefined) {
            return { kind: 'refused', reason: 'source-unavailable' };
        }
        const cursor = this.deps.records.readRecap(String(request.tab))?.lanes.find((candidate) => candidate.pane === String(request.pane)) ?? null;
        return this.deps.render({ handoff: request.id, at: this.deps.now(), lane, cursor, facts, note: request.note, refresh });
    }

    private async deliver(request: HandoffRequestRow, text: string, mark: DeliveryMark): Promise<HandoffOutcome> {
        const first = await this.resolve(request);
        if (first.kind !== 'ready') {
            return first;
        }
        await this.deps.pause(first.plan.settle.after);
        const held = await this.resolve(request);
        if (held.kind !== 'ready') {
            return { kind: 'refused', reason: 'status-not-ready' };
        }
        if (!mark.startTyping()) {
            return { kind: 'failed', reason: 'expired' };
        }
        return this.deps.sender.send(held, text);
    }
}
