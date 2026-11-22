import type { Lane } from '#src/recap/domain/lane.ts';
import type { Messages } from '#src/i18n/index.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { READY } from '#src/recap/domain/status.ts';
import type { CompactionEnd } from '#src/ports/compaction-records.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { finalAnswerOf, parseAskId } from '#src/recap/domain/compact-request.ts';
import { linkAsk } from './compaction-asks.ts';
import { failureStage } from '#src/protocol/exchange.ts';
import { COMPACT_EVENTS, COMPACT_FAILURES, COMPACT_STAGES, type CompactFailure } from '#src/protocol/exchanges/compact.ts';
import { laneBusyRefusal, laneClosedRefusal, splitByClaim, type Asked, type Refusal } from './compaction-lanes.ts';
import { LANE_CLOSED, type ClosePoint } from '#src/recap/domain/lane-closed.ts';
import { withNote } from '#src/recap/domain/continuation-note.ts';
import { clean } from './compaction-brief.ts';
import type { CoverageFlow, Briefed, Checked } from './compaction-coverage.ts';
import { blockedByCoverage } from './coverage-verdict.ts';
import type { CompactionPorts } from './compaction-deps.ts';
import { wiringOf, type CompactionDeps } from './twins/compaction-wiring/legacy.ts';
import type { Material } from './compaction-message.ts';
import { Briefing } from './compaction-briefing.ts';
import { Sender, type Placed, type Placement } from './compaction-send.ts';
import { scopeOf } from './compaction-targets.ts';
import { Trail } from './compaction-trail.ts';
import { paneId, parseCompactionId } from '#src/recap/domain/ids.ts';
import type { AgentKind, CompactionId, PaneId, TabId } from '#src/recap/domain/ids.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { parseAnswerStage, type AnswerStage } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';

export type { CompactionDeps } from './twins/compaction-wiring/legacy.ts';

type Gate = { readonly kind: 'refused'; readonly refusal: Refusal } | ({ readonly kind: 'proceed' } & Placed);

type Queueing = 'queues' | 'waits';

interface Start {
    readonly tab: TabId;
    readonly pane: PaneId;
    readonly agent: AgentKind;
    readonly stage: 'briefing' | 'compacting';
    readonly writer: Text | null;
}

interface TypedAt { readonly lane: Lane; readonly tab: TabId; readonly request: CompactRequest; readonly trail: Trail }

interface CoverageStop { readonly lane: Lane; readonly checked: Checked; readonly flow: CoverageFlow; readonly trail: Trail; readonly said: (text: Text) => Text; readonly messages: Messages['compaction'] }


export class Compactor {
    private readonly deps: CompactionPorts;
    private readonly sender: Sender;
    private readonly briefing: Briefing;

    constructor(deps: CompactionPorts) {
        this.deps = deps;
        this.sender = new Sender(deps);
        this.briefing = new Briefing(deps);
    }

    private async tell(title: Text, body: Text): Promise<void> {
        const shown = await this.deps.notifier.notify(title, body);
        if (isUnknown(shown)) {
            this.deps.log(must(parseText(`compaction: toast not shown (${saying(shown.why)})`)));
        }
    }

    private queueing(agent: AgentKind): Queueing {
        const plan = this.deps.compactionPlans.forKind(agent, textOf(''));
        return plan.kind === 'supported' && plan.plan.whileWorking.kind === 'queues' ? 'queues' : 'waits';
    }

    private async gateOf(lane: Lane, point: ClosePoint): Promise<Gate> {
        const { compaction, badge } = this.deps.messages();
        const agent = lane.agent;
        const state = await this.deps.agents.status(lane.pane);
        if (isUnknown(state)) {
            if (state.why.why === 'not-found') return { kind: 'refused', refusal: laneClosedRefusal(point) };
            const why = must(parseText(saying(state.why)));
            return { kind: 'refused', refusal: { stage: 'failed', reason: COMPACT_FAILURES.error, why, toast: must(parseText(compaction.failed(agent, why))) } };
        }
        if (READY.has(state.status)) return { kind: 'proceed', placement: 'immediate' };
        if (state.status === 'working' && this.queueing(agent) === 'queues') return { kind: 'proceed', placement: 'queued' };
        const reason = state.status === 'working' ? COMPACT_FAILURES.busy : COMPACT_FAILURES.skipped;
        return { kind: 'refused', refusal: { stage: 'skipped', reason, why: must(parseText(badge[state.status])), toast: must(parseText(compaction.skipped(agent, state.status))) } };
    }

    private answerOne(request: CompactRequest | null, pane: PaneId, stage: AnswerStage): void {
        const id = request?.answer === undefined ? null : parseAskId(request.answer);
        if (id !== null && pane !== '') {
            this.deps.answer?.(id, pane, stage);
        }
    }

    private answer(request: CompactRequest | null, pane: PaneId, stage: AnswerStage): void {
        this.answerOne(request, pane, stage);
        for (const joined of this.deps.claims.joinedOf(pane)) {
            this.answerOne(joined, pane, stage);
        }
    }

    private joinRunning(lane: Lane, request: CompactRequest): void {
        const [pane, agent] = [lane.pane, lane.agent];
        const { compaction } = this.deps.messages();
        this.deps.claims.join(pane, request);
        this.answerOne(request, pane, must(parseAnswerStage(COMPACT_STAGES.queued)));
        if (request.origin !== 'auto') {
            void this.tell(must(parseText(compaction.title(agent))), must(parseText(compaction.joined(agent, request.note !== null))));
        }
    }

    private claimed(lane: Lane, request: CompactRequest): Presence {
        if (this.deps.claims.claim(String(lane.pane), 'compaction')) {
            return 'present';
        }
        this.joinRunning(lane, request);
        return 'absent';
    }

    private async refuse(lane: Lane, tab: TabId, trail: Trail | null, refusal: Refusal, asked: Asked): Promise<void> {
        const { origin, request } = asked;
        if (trail === null) {
            const pane = lane.pane;
            const id = this.deps.compactions.begin({ tab, pane, agent: String(lane.agent), stage: refusal.stage, at: this.deps.now(), why: refusal.why, origin, answer: request?.answer ?? null });
            linkAsk(this.deps.asks, request, pane, must(parseText(id)));
            if (refusal.closedAt === undefined) this.deps.events?.lane(pane, COMPACT_EVENTS.failed, `${id}:${refusal.why}`);
            this.answer(request, pane, must(parseAnswerStage(failureStage(refusal.reason))));
        } else {
            trail.end(refusal.stage, { why: refusal.why }, refusal.reason);
        }
        this.logClosed(lane, refusal.closedAt);
        if (refusal.toast !== null) await this.tell(must(parseText(this.deps.messages().compaction.title(String(lane.agent)))), must(parseText(refusal.toast)));
    }

    private logClosed(lane: Lane, point: ClosePoint | undefined): void {
        if (point !== undefined) this.deps.log(must(parseText(this.deps.messages().compaction.laneClosed(String(lane.agent), String(lane.pane), point))));
    }

    private endClosed(lane: Lane, trail: Trail, point: ClosePoint): void {
        trail.end('skipped', { why: LANE_CLOSED }, COMPACT_FAILURES.skipped);
        this.logClosed(lane, point);
    }

    private async gated(lane: Lane, tab: TabId, trail: Trail | null, point: ClosePoint, asked: Asked = { origin: 'operator', request: null }): Promise<Gate> {
        const gate = await this.gateOf(lane, point);
        if (gate.kind === 'refused') {
            await this.refuse(lane, tab, trail, gate.refusal, asked);
        }
        return gate;
    }

    private begun(request: CompactRequest, start: Start): CompactionId {
        const id = must(parseCompactionId(this.deps.compactions.begin({ ...start, at: this.deps.now(), origin: request.origin ?? 'operator', answer: request.answer ?? null })));
        linkAsk(this.deps.asks, request, start.pane, must(parseText(id)));
        this.deps.events?.lane(start.pane, COMPACT_EVENTS.queued, id);
        return id;
    }

    private ended(request: CompactRequest, pane: PaneId, id: CompactionId, end: CompactionEnd, reason: CompactFailure | null): void {
        this.answer(request, pane, must(parseAnswerStage(finalAnswerOf(end.stage, reason))));
        if (end.why === LANE_CLOSED) return;
        this.deps.events?.lane(pane, end.stage === 'compacted' ? COMPACT_EVENTS.done : COMPACT_EVENTS.failed, end.stage === 'compacted' ? id : `${id}:${end.why ?? end.stage}`);
    }

    private opened(lane: Lane, tab: TabId, request: CompactRequest): Trail {
        const pane = lane.pane;
        const id = this.begun(request, { tab, pane, agent: lane.agent, stage: this.deps.brief.enabled() === 'present' ? 'briefing' : 'compacting', writer: this.deps.brief.job() });
        this.answer(request, pane, must(parseAnswerStage(COMPACT_STAGES.running)));
        this.deps.events?.lane(pane, COMPACT_EVENTS.running, id);
        return new Trail(this.deps.compactions, id, () => this.deps.now(), (end, reason) => { this.ended(request, pane, id, end, reason); });
    }

    private beginning(agent: AgentKind, placement: Placement): Text {
        const { compaction } = this.deps.messages();
        if (placement === 'queued') return must(parseText(compaction.startedQueued(agent)));
        return must(parseText(this.deps.brief.enabled() === 'present' ? compaction.writing(agent) : compaction.started(agent)));
    }

    private async compact(lane: Lane, tab: TabId, request: CompactRequest, placement: Placement): Promise<void> {
        const { compaction } = this.deps.messages();
        const [pane, agent, auto] = [lane.pane, lane.agent, request.origin === 'auto'];
        const trail = this.opened(lane, tab, request);
        if (this.briefing.listed(lane) === 'absent') {
            this.endClosed(lane, trail, 'before-writer');
            return;
        }
        const said = (text: Text): Text => must(parseText(auto ? compaction.auto(text) : text));
        await this.tell(said(must(parseText(compaction.title(agent)))), said(this.beginning(agent, placement)));
        const material = this.briefing.materialOf(tab, pane, request.note === null ? null : must(parseText(request.note)));
        const link = this.briefing.linkedDecision(auto ? 'auto' : 'operator', tab, pane, trail.id);
        const verified = await this.briefing.verified(lane, tab, material, link);
        if (verified.kind === 'closed') {
            this.endClosed(lane, trail, verified.at);
            return;
        }
        if ((await this.stoppedByCoverage({ lane, checked: verified.checked, flow: link.flow, trail, said, messages: compaction })) === 'present') return;
        await this.typed({ lane, tab, request, trail }, material, verified.checked.brief);
    }

    private async typed(at: TypedAt, material: Material, brief: Briefed): Promise<void> {
        const { lane, tab, request, trail } = at;
        trail.to('compacting', { brief: brief.text === null ? 'template' : 'written', ...(brief.why === null ? {} : { templateWhy: brief.why }) });
        if (this.briefing.listed(lane) === 'absent') {
            this.endClosed(lane, trail, 'before-typing');
            return;
        }
        const gate = await this.gated(lane, tab, trail, 'before-typing');
        if (gate.kind !== 'proceed') return;
        const unsupported = await this.sender.send(lane, { material: { ...material, sections: clean(material.sections, brief.own) }, brief: this.keptNote(brief.text, request) }, trail, gate);
        if (unsupported !== undefined) {
            const messages = this.deps.messages();
            await this.tell(must(parseText(messages.compaction.title(String(lane.agent)))), must(parseText(messages.compaction.failed(String(lane.agent), unsupported.why))));
        }
    }

    private keptNote(brief: Text | null, request: CompactRequest): Text | null {
        return brief !== null && request.origin === 'auto' && request.note !== null ? withNote(brief, must(parseText(request.note))) : brief;
    }

    private async stoppedByCoverage(parts: CoverageStop): Promise<Presence> {
        const { lane, checked, flow, trail, said, messages } = parts;
        if (blockedByCoverage(checked, flow) === 'absent') return 'absent';
        trail.end('skipped', { why: 'coverage' });
        await this.tell(said(must(parseText(messages.title(String(lane.agent))))), must(parseText(messages.coverageMissed(String(lane.agent)))));
        return 'present';
    }

    private async withoutTarget(request: CompactRequest): Promise<void> {
        const { compaction } = this.deps.messages();
        const pane = request.pane === null || request.pane === '' ? null : paneId(request.pane);
        if (request.origin === 'auto' && pane !== null && this.deps.listsPane(pane) === 'absent') {
            this.answer(request, pane, must(parseAnswerStage(failureStage(COMPACT_FAILURES.skipped))));
            this.deps.log(must(parseText(compaction.laneClosed(null, pane, 'before-writer'))));
            return;
        }
        if (pane !== null) this.answer(request, pane, must(parseAnswerStage(failureStage(COMPACT_FAILURES.noTarget))));
        await this.tell(must(parseText(compaction.title(request.tab))), must(parseText(compaction.nothing)));
    }

    async run(request: CompactRequest): Promise<void> {
        const scope = await scopeOf(this.deps, request);
        if (scope === null) {
            await this.withoutTarget(request);
            return;
        }
        const { tab, lanes, targets } = scope;
        const origin = request.origin ?? 'operator';
        const { owned, held } = splitByClaim(this.deps.claims, targets, (lane) => this.claimed(lane, request));
        try {
            await Promise.all(held.map((lane) => this.refuse(lane, tab, null, laneBusyRefusal(this.deps.messages(), lane), { origin, request })));
            if (owned.length === 0) {
                return;
            }
            const gates = await Promise.all(owned.map(async (lane) => ({ lane, gate: await this.gated(lane, tab, null, 'status-check', { origin, request }) })));
            const ready = gates.flatMap(({ lane, gate }) => (gate.kind === 'proceed' ? [{ lane, placement: gate.placement }] : []));
            if (ready.length === 0) {
                return;
            }
            await this.deps.refresh(tab, lanes);
            await Promise.all(ready.map(({ lane, placement }) => this.compact(lane, tab, request, placement)));
        } catch (error) {
            for (const lane of owned) {
                this.answer(request, lane.pane, must(parseAnswerStage(failureStage(COMPACT_FAILURES.error))));
            }
            throw error;
        } finally {
            for (const lane of owned) {
                this.deps.claims.release(String(lane.pane));
            }
        }
    }
}

export class Compaction {
    private readonly compactor: Compactor;
    constructor(deps: CompactionDeps) { this.compactor = new Compactor(wiringOf(deps)); }
    run(request: CompactRequest): Promise<void> { return this.compactor.run(request); }
}
