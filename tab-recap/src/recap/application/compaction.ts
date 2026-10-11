import type { Lane } from '#src/recap/domain/lane.ts';
import type { Messages } from '#src/i18n/index.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { READY } from '#src/recap/domain/status.ts';
import type { CompactionEnd } from '#src/ports/compaction-records.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { finalAnswerOf } from '#src/recap/domain/compact-request.ts';
import { linkAsk } from './compaction-asks.ts';
import { failureStage } from '#src/protocol/exchange.ts';
import { COMPACT_EVENTS, COMPACT_FAILURES, COMPACT_STAGES } from '#src/protocol/exchanges/compact.ts';
import type { CompactFailure } from '#src/protocol/exchanges/compact.ts';
import { laneBusyRefusal, laneClosedRefusal, splitByClaim } from './compaction-lanes.ts';
import { LANE_CLOSED } from '#src/recap/domain/lane-closed.ts';
import type { ClosePoint } from '#src/recap/domain/lane-closed.ts';
import type { Asked, Refusal } from './compaction-lanes.ts';
import { withNote } from '#src/recap/domain/continuation-note.ts';
import { clean } from './compaction-brief.ts';
import type { CoverageFlow } from './compaction-coverage.ts';
import type { Briefed, Checked } from './compaction-coverage.ts';
import { blockedByCoverage } from './coverage-verdict.ts';
import type { CompactionDeps } from './compaction-deps.ts';
import type { Material } from './compaction-message.ts';
import { Briefing } from './compaction-briefing.ts';
import { Sender } from './compaction-send.ts';
import type { Placed } from './compaction-send.ts';
import { targetsOf } from './compaction-targets.ts';
import { Trail } from './compaction-trail.ts';

export type { CompactionDeps } from './compaction-deps.ts';

type Gate = { readonly kind: 'refused'; readonly refusal: Refusal } | ({ readonly kind: 'proceed' } & Placed);

export class Compaction {
    private readonly deps: CompactionDeps;
    private readonly sender: Sender;
    private readonly briefing: Briefing;

    constructor(deps: CompactionDeps) {
        this.deps = deps;
        this.sender = new Sender(deps);
        this.briefing = new Briefing(deps);
    }

    private async tell(title: string, body: string): Promise<void> {
        const shown = await this.deps.notifier.notify(title, body);
        if (isUnknown(shown)) {
            this.deps.log(`compaction: toast not shown (${saying(shown.why)})`);
        }
    }

    private queues(agent: string): boolean {
        const plan = this.deps.compactionPlans.forKind(agent, '');
        return plan.kind === 'supported' && plan.plan.whileWorking.kind === 'queues';
    }

    private async gateOf(lane: Lane, point: ClosePoint): Promise<Gate> {
        const { compaction, badge } = this.deps.messages();
        const agent = String(lane.agent);
        const state = await this.deps.agents.status(String(lane.pane));
        if (isUnknown(state)) {
            if (state.why.why === 'not-found') return { kind: 'refused', refusal: laneClosedRefusal(point) };
            const why = saying(state.why);
            return { kind: 'refused', refusal: { stage: 'failed', reason: COMPACT_FAILURES.error, why, toast: compaction.failed(agent, why) } };
        }
        if (READY.has(state.status)) return { kind: 'proceed', queued: false };
        if (state.status === 'working' && this.queues(agent)) return { kind: 'proceed', queued: true };
        const reason = state.status === 'working' ? COMPACT_FAILURES.busy : COMPACT_FAILURES.skipped;
        return { kind: 'refused', refusal: { stage: 'skipped', reason, why: badge[state.status], toast: compaction.skipped(agent, state.status) } };
    }

    private answerOne(request: CompactRequest | null, pane: string, stage: string): void {
        if (request?.answer !== undefined && pane !== '') {
            this.deps.answer?.(request.answer, pane, stage);
        }
    }

    private answer(request: CompactRequest | null, pane: string, stage: string): void {
        this.answerOne(request, pane, stage);
        for (const joined of this.deps.claims.joinedOf(pane)) {
            this.answerOne(joined, pane, stage);
        }
    }

    private joinRunning(lane: Lane, request: CompactRequest): void {
        const [pane, agent] = [String(lane.pane), String(lane.agent)];
        const { compaction } = this.deps.messages();
        this.deps.claims.join(pane, request);
        this.answerOne(request, pane, COMPACT_STAGES.queued);
        if (request.origin !== 'auto') {
            void this.tell(compaction.title(agent), compaction.joined(agent, request.note !== null));
        }
    }

    private claimed(lane: Lane, request: CompactRequest): boolean {
        if (this.deps.claims.claim(String(lane.pane), 'compaction')) {
            return true;
        }
        this.joinRunning(lane, request);
        return false;
    }

    private async refuse(lane: Lane, tab: string, trail: Trail | null, refusal: Refusal, asked: Asked): Promise<void> {
        const { origin, request } = asked;
        if (trail === null) {
            const pane = String(lane.pane);
            const id = this.deps.compactions.begin({ tab, pane, agent: String(lane.agent), stage: refusal.stage, at: this.deps.now(), why: refusal.why, origin, answer: request?.answer ?? null });
            linkAsk(this.deps.asks, request, pane, id);
            this.deps.events?.lane(pane, COMPACT_EVENTS.failed, `${id}:${refusal.why}`);
            this.answer(request, pane, failureStage(refusal.reason));
        } else {
            trail.end(refusal.stage, { why: refusal.why }, refusal.reason);
        }
        this.logClosed(lane, refusal.closedAt);
        if (refusal.toast !== null) await this.tell(this.deps.messages().compaction.title(String(lane.agent)), refusal.toast);
    }

    private logClosed(lane: Lane, point: ClosePoint | undefined): void {
        if (point !== undefined) this.deps.log(this.deps.messages().compaction.laneClosed(String(lane.agent), String(lane.pane), point));
    }

    private endClosed(lane: Lane, trail: Trail, point: ClosePoint): void {
        trail.end('skipped', { why: LANE_CLOSED }, COMPACT_FAILURES.skipped);
        this.logClosed(lane, point);
    }

    private async gated(lane: Lane, tab: string, trail: Trail | null, point: ClosePoint, asked: Asked = { origin: 'operator', request: null }): Promise<Gate> {
        const gate = await this.gateOf(lane, point);
        if (gate.kind === 'refused') {
            await this.refuse(lane, tab, trail, gate.refusal, asked);
        }
        return gate;
    }

    private begun(request: CompactRequest, start: { readonly tab: string; readonly pane: string; readonly agent: string; readonly stage: 'briefing' | 'compacting'; readonly writer: string | null }): string {
        const id = this.deps.compactions.begin({ ...start, at: this.deps.now(), origin: request.origin ?? 'operator', answer: request.answer ?? null });
        linkAsk(this.deps.asks, request, start.pane, id);
        this.deps.events?.lane(start.pane, COMPACT_EVENTS.queued, id);
        return id;
    }

    private ended(request: CompactRequest, pane: string, id: string, end: CompactionEnd, reason: CompactFailure | null): void {
        this.answer(request, pane, finalAnswerOf(end.stage, reason));
        this.deps.events?.lane(pane, end.stage === 'compacted' ? COMPACT_EVENTS.done : COMPACT_EVENTS.failed, end.stage === 'compacted' ? id : `${id}:${end.why ?? end.stage}`);
    }

    private opened(lane: Lane, tab: string, request: CompactRequest): Trail {
        const [pane, agent] = [String(lane.pane), String(lane.agent)];
        const id = this.begun(request, { tab, pane, agent, stage: this.deps.brief.enabled() ? 'briefing' : 'compacting', writer: this.deps.brief.job() });
        this.answer(request, pane, COMPACT_STAGES.running);
        this.deps.events?.lane(pane, COMPACT_EVENTS.running, id);
        return new Trail(this.deps.compactions, id, () => this.deps.now(), (end, reason) => { this.ended(request, pane, id, end, reason); });
    }

    private beginning(agent: string, queued: boolean): string {
        const { compaction } = this.deps.messages();
        if (queued) return compaction.startedQueued(agent);
        return this.deps.brief.enabled() ? compaction.writing(agent) : compaction.started(agent);
    }

    private async compact(lane: Lane, tab: string, request: CompactRequest, queued: boolean): Promise<void> {
        const { compaction } = this.deps.messages();
        const [pane, agent, auto] = [String(lane.pane), String(lane.agent), request.origin === 'auto'];
        const trail = this.opened(lane, tab, request);
        if (!this.briefing.listed(lane)) {
            this.endClosed(lane, trail, 'before-writer');
            return;
        }
        const said = (text: string): string => (auto ? compaction.auto(text) : text);
        await this.tell(said(compaction.title(agent)), said(this.beginning(agent, queued)));
        const material = this.briefing.materialOf(tab, pane, request.note);
        const link = this.briefing.linkedDecision(auto, tab, pane, trail.id);
        const verified = await this.briefing.verified(lane, tab, material, link);
        if (verified.kind === 'closed') {
            this.endClosed(lane, trail, verified.at);
            return;
        }
        if (await this.stoppedByCoverage({ lane, checked: verified.checked, flow: link.flow, trail, said, messages: compaction })) return;
        await this.typed({ lane, tab, request, trail }, material, verified.checked.brief);
    }

    private async typed(at: { readonly lane: Lane; readonly tab: string; readonly request: CompactRequest; readonly trail: Trail }, material: Material, brief: Briefed): Promise<void> {
        const { lane, tab, request, trail } = at;
        trail.to('compacting', { brief: brief.text === null ? 'template' : 'written', ...(brief.why === null ? {} : { templateWhy: brief.why }) });
        if (!this.briefing.listed(lane)) {
            this.endClosed(lane, trail, 'before-typing');
            return;
        }
        const gate = await this.gated(lane, tab, trail, 'before-typing');
        if (gate.kind !== 'proceed') return;
        const unsupported = await this.sender.send(lane, { material: { ...material, sections: clean(material.sections, brief.own) }, brief: this.keptNote(brief.text, request) }, trail, gate);
        if (unsupported !== undefined) {
            const messages = this.deps.messages();
            await this.tell(messages.compaction.title(String(lane.agent)), messages.compaction.failed(String(lane.agent), unsupported.why));
        }
    }

    private keptNote(brief: string | null, request: CompactRequest): string | null {
        return brief !== null && request.origin === 'auto' && request.note !== null ? withNote(brief, request.note) : brief;
    }

    private async stoppedByCoverage(parts: { readonly lane: Lane; readonly checked: Checked; readonly flow: CoverageFlow; readonly trail: Trail; readonly said: (text: string) => string; readonly messages: Messages['compaction'] }): Promise<boolean> {
        const { lane, checked, flow, trail, said, messages } = parts;
        if (!blockedByCoverage(checked, flow)) return false;
        trail.end('skipped', { why: 'coverage' });
        await this.tell(said(messages.title(String(lane.agent))), messages.coverageMissed(String(lane.agent)));
        return true;
    }

    private async withoutTarget(request: CompactRequest): Promise<void> {
        const { compaction } = this.deps.messages();
        if (request.origin === 'auto' && request.pane !== null && !this.deps.listsPane(request.pane)) {
            this.answer(request, request.pane, failureStage(COMPACT_FAILURES.skipped));
            this.deps.log(compaction.laneClosed(null, request.pane, 'before-writer'));
            return;
        }
        this.answer(request, request.pane ?? '', failureStage(COMPACT_FAILURES.noTarget));
        await this.tell(compaction.title(request.tab), compaction.nothing);
    }

    async run(request: CompactRequest): Promise<void> {
        const { tab } = request;
        const lanes = this.deps.lanes(tab);
        const targets = targetsOf(lanes, this.deps.target(), { pane: request.pane, focused: await this.deps.focused(tab) });
        if (targets.length === 0) {
            await this.withoutTarget(request);
            return;
        }
        const { owned, held } = splitByClaim(this.deps.claims, targets, (lane) => this.claimed(lane, request));
        try {
            await Promise.all(held.map((lane) => this.refuse(lane, tab, null, laneBusyRefusal(this.deps.messages(), lane), { origin: request.origin ?? 'operator', request })));
            if (owned.length === 0) {
                return;
            }
            const gates = await Promise.all(owned.map(async (lane) => ({ lane, gate: await this.gated(lane, tab, null, 'status-check', { origin: request.origin ?? 'operator', request }) })));
            const ready = gates.flatMap(({ lane, gate }) => (gate.kind === 'proceed' ? [{ lane, queued: gate.queued }] : []));
            if (ready.length === 0) {
                return;
            }
            await this.deps.refresh(tab, lanes);
            await Promise.all(ready.map(({ lane, queued }) => this.compact(lane, tab, request, queued)));
        } catch (error) {
            for (const lane of owned) {
                this.answer(request, String(lane.pane), failureStage(COMPACT_FAILURES.error));
            }
            throw error;
        } finally {
            for (const lane of owned) {
                this.deps.claims.release(String(lane.pane));
            }
        }
    }
}
