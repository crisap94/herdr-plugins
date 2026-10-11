import type { Lane } from '#src/recap/domain/lane.ts';
import type { Messages } from '#src/i18n/index.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { LinkedDecision } from '#src/ports/autocompact-records.ts';
import type { CompactionEnd } from '#src/ports/compaction-records.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { finalAnswerOf } from '#src/recap/domain/compact-request.ts';
import { linkAsk } from './compaction-asks.ts';
import { failureStage } from '#src/protocol/exchange.ts';
import { COMPACT_EVENTS, COMPACT_FAILURES, COMPACT_STAGES } from '#src/protocol/exchanges/compact.ts';
import type { CompactFailure } from '#src/protocol/exchanges/compact.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { clean } from './compaction-brief.ts';
import { appendedBrief, checkedBrief } from './compaction-coverage.ts';
import type { CoverageFlow } from './compaction-coverage.ts';
import { factsOf } from './brief-coverage.ts';
import { isSection } from '#src/recap/domain/fact.ts';
import type { Briefed, Checked } from './compaction-coverage.ts';
import { blockedByCoverage, coverageLog, coverageWhy } from './coverage-verdict.ts';
import { compactionInput } from './compaction-input.ts';
import type { CompactionDeps } from './compaction-deps.ts';
import type { Material } from './compaction-message.ts';
import type { CheckedFact, MissedFacts } from '#src/recap/domain/autocompact.ts';
import { MISSED_FACTS_DEFAULT } from '#src/recap/domain/autocompact.ts';
import { Sender } from './compaction-send.ts';
import type { Placed } from './compaction-send.ts';
import { targetsOf } from './compaction-targets.ts';
import { Trail } from './compaction-trail.ts';

export type { CompactionDeps } from './compaction-deps.ts';

const READY = new Set(['idle', 'done']);
interface Link {
    readonly auto: boolean;
    readonly decision: string | null;
    readonly flow: CoverageFlow;
}

interface Refusal {
    readonly stage: 'skipped' | 'failed';
    readonly reason: CompactFailure;
    readonly why: string;
    readonly toast: string;
}

type Gate = { readonly kind: 'refused'; readonly refusal: Refusal } | ({ readonly kind: 'proceed' } & Placed);

export class Compaction {
    private readonly deps: CompactionDeps;
    private readonly sender: Sender;

    constructor(deps: CompactionDeps) {
        this.deps = deps;
        this.sender = new Sender(deps);
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

    private async gateOf(lane: Lane): Promise<Gate> {
        const { compaction, badge } = this.deps.messages();
        const agent = String(lane.agent);
        const state = await this.deps.agents.status(String(lane.pane));
        if (isUnknown(state)) {
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
        if (this.deps.claims.claim(String(lane.pane))) {
            return true;
        }
        this.joinRunning(lane, request);
        return false;
    }

    private async gated(lane: Lane, tab: string, trail: Trail | null, origin: Origin = 'operator', request: CompactRequest | null = null): Promise<Gate> {
        const gate = await this.gateOf(lane);
        if (gate.kind === 'proceed') {
            return gate;
        }
        const { refusal } = gate;
        if (trail === null) {
            const id = this.deps.compactions.begin({ tab, pane: String(lane.pane), agent: String(lane.agent), stage: refusal.stage, at: this.deps.now(), why: refusal.why, origin, answer: request?.answer ?? null });
            linkAsk(this.deps.asks, request, String(lane.pane), id);
            this.deps.events?.lane(String(lane.pane), COMPACT_EVENTS.failed, `${id}:${refusal.why}`);
            this.answer(request, String(lane.pane), failureStage(refusal.reason));
        } else {
            trail.end(refusal.stage, { why: refusal.why }, refusal.reason);
        }
        await this.tell(this.deps.messages().compaction.title(String(lane.agent)), refusal.toast);
        return gate;
    }

    private materialOf(tab: string, pane: string, note: string | null): Material {
        const tasks = this.deps.records.readRecap(tab)?.tasks ?? [];
        const task = tasks.find((each) => each.lanes.includes(pane)) ?? tasks[0];
        return { sections: task?.sections ?? NO_SECTIONS, web: this.deps.webs.of(pane), note };
    }

    private async briefOf(lane: Lane, tab: string, material: Material, correction?: string): Promise<Briefed & { readonly history: ReturnType<Ledger['historyOf']> }> {
        const { brief, records, ledger } = this.deps;
        const [pane, agent] = [String(lane.pane), String(lane.agent)];
        const [recent, history]: [readonly Entry[], ReturnType<typeof ledger.historyOf>] = [await this.deps.recent(lane), ledger.historyOf(tab, pane)];
        const own = [...recent.map((entry) => entry.text), ...history.flatMap((item) => [item.text, item.why ?? ''])].join('\n');
        if (!brief.enabled()) {
            return { text: null, why: null, own, history };
        }
        const label = records.readRecap(tab)?.lanes.find((each) => each.pane === pane)?.title ?? lane.title ?? '';
        const clock = { now: this.deps.now(), zone: Intl.DateTimeFormat().resolvedOptions().timeZone };
        const document = compactionInput({ agent: { kind: agent, label, repo: null, branch: null }, note: material.note, current: material.sections, history, lastBreakAt: this.deps.boundaries.lastBreakAt(tab, pane), recent, clock });
        return { ...(await brief.write(document, own, correction)), own, history };
    }

    private async verified(lane: Lane, tab: string, material: Material, link: Link): Promise<Checked> {
        const { auto, decision, flow } = link;
        const first = await this.briefOf(lane, tab, material);
        if (!auto) return { brief: first, coverage: null, outcome: { kind: 'passed' }, coverageMs: 0, coverageCostUsd: null, why: null };
        const checked = await checkedBrief(this.deps, first, first.history, (correction) => this.briefOf(lane, tab, material, correction), flow);
        const saved = this.rememberCoverage(decision, checked, first.history, flow);
        const messages = this.deps.messages();
        const blocked = blockedByCoverage(saved, flow);
        const line = flow.appends ? coverageLog(saved.outcome, messages) : null;
        if (line !== null) this.deps.log(`${flow.atCeiling ? 'autocompact ceiling' : 'autocompact'}: ${line}`);
        if (decision !== null) this.deps.decisions?.amend(decision, { coverage: saved.coverage, outcome: saved.outcome, coverageMs: saved.coverageMs, coverageCostUsd: saved.coverageCostUsd, why: blocked ? saved.why : coverageWhy(saved.outcome, saved.why, messages), block: blocked });
        return saved;
    }

    private rememberCoverage(decision: string | null, checked: Checked, history: ReturnType<Ledger['historyOf']>, flow: CoverageFlow): Checked {
        const checkedFacts: readonly CheckedFact[] = factsOf(history).flatMap((fact) => isSection(fact.section) ? [{ section: fact.section, text: fact.text, why: fact.why }] : []);
        const appended = flow.appends && checked.outcome.kind === 'missed' && checked.brief.text !== null
            ? appendedBrief(checked.brief.text, checked.outcome.facts, checkedFacts)
            : null;
        if (decision !== null && checked.brief.text !== null) this.deps.checkedBriefs?.put(decision, checked.brief.text, appended?.indexes ?? [], checkedFacts, this.deps.now());
        return appended === null ? checked : { ...checked, brief: { ...checked.brief, text: appended.text } };
    }

    private linkedDecision(auto: boolean, tab: string, pane: string, id: string): Link {
        const linked = auto ? this.deps.decisions?.linkLatest(tab, pane, id) ?? null : null;
        return { auto, decision: linked?.id ?? null, flow: this.flowOf(linked?.gate) };
    }

    private flowOf(gate: LinkedDecision['gate'] | undefined): CoverageFlow {
        const atCeiling = gate === 'ceiling' && this.deps.ceilingOverride?.() !== false;
        const missedFacts: MissedFacts = this.deps.missedFacts?.() ?? MISSED_FACTS_DEFAULT;
        return { atCeiling, appends: atCeiling || missedFacts === 'append' };
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

    private async compact(lane: Lane, tab: string, request: CompactRequest, queued: boolean): Promise<void> {
        const { compaction } = this.deps.messages();
        const [pane, agent, auto] = [String(lane.pane), String(lane.agent), request.origin === 'auto'];
        const writing = this.deps.brief.enabled();
        const id = this.begun(request, { tab, pane, agent, stage: writing ? 'briefing' : 'compacting', writer: this.deps.brief.job() });
        this.answer(request, pane, COMPACT_STAGES.running);
        this.deps.events?.lane(pane, COMPACT_EVENTS.running, id);
        const trail = new Trail(this.deps.compactions, id, () => this.deps.now(), (end, reason) => { this.ended(request, pane, id, end, reason); });
        const said = (text: string): string => (auto ? compaction.auto(text) : text);
        let beginning = writing ? compaction.writing(agent) : compaction.started(agent);
        if (queued) beginning = compaction.startedQueued(agent);
        await this.tell(said(compaction.title(agent)), said(beginning));
        const material = this.materialOf(tab, pane, request.note);
        const link = this.linkedDecision(auto, tab, pane, id);
        const checked = await this.verified(lane, tab, material, link);
        if (await this.stoppedByCoverage({ lane, checked, flow: link.flow, trail, said, messages: compaction })) return;
        const { brief } = checked;
        trail.to('compacting', { brief: brief.text === null ? 'template' : 'written', ...(brief.why === null ? {} : { templateWhy: brief.why }) });
        const gate = await this.gated(lane, tab, trail);
        if (gate.kind === 'proceed') {
            const unsupported = await this.sender.send(lane, { material: { ...material, sections: clean(material.sections, brief.own) }, brief: brief.text }, trail, gate);
            if (unsupported !== undefined) {
                const messages = this.deps.messages();
                await this.tell(messages.compaction.title(String(lane.agent)), messages.compaction.failed(String(lane.agent), unsupported.why));
            }
        }
    }

    private async stoppedByCoverage(parts: { readonly lane: Lane; readonly checked: Checked; readonly flow: CoverageFlow; readonly trail: Trail; readonly said: (text: string) => string; readonly messages: Messages['compaction'] }): Promise<boolean> {
        const { lane, checked, flow, trail, said, messages } = parts;
        if (!blockedByCoverage(checked, flow)) return false;
        trail.end('skipped', { why: 'coverage' });
        await this.tell(said(messages.title(String(lane.agent))), messages.coverageMissed(String(lane.agent)));
        return true;
    }

    async run(request: CompactRequest): Promise<void> {
        const { tab } = request;
        const lanes = this.deps.lanes(tab);
        const targets = targetsOf(lanes, this.deps.target(), { pane: request.pane, focused: await this.deps.focused(tab) });
        if (targets.length === 0) {
            this.answer(request, request.pane ?? '', failureStage(COMPACT_FAILURES.noTarget));
            await this.tell(this.deps.messages().compaction.title(tab), this.deps.messages().compaction.nothing);
            return;
        }
        const owned = targets.filter((lane) => this.claimed(lane, request));
        if (owned.length === 0) {
            return;
        }
        try {
            const gates = await Promise.all(owned.map(async (lane) => ({ lane, gate: await this.gated(lane, tab, null, request.origin ?? 'operator', request) })));
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
