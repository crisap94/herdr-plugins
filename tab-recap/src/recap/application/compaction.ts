import type { Lane } from '#src/recap/domain/lane.ts';
import type { Messages } from '#src/i18n/index.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { READY } from '#src/recap/domain/status.ts';
import type { Ledger } from '#src/ports/ledger.ts';
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
import { factsOf } from './brief-coverage.ts';
import { isSection } from '#src/recap/domain/fact.ts';
import type { Briefed, Checked } from './compaction-coverage.ts';
import { blockedByCoverage, coverageLog, coverageWhy } from './coverage-verdict.ts';
import { compactionInput } from './compaction-input.ts';
import type { CompactionDeps } from './compaction-deps.ts';
import type { Material } from './compaction-message.ts';
import type { CheckedFact } from '#src/recap/domain/autocompact.ts';
import { Sender } from './compaction-send.ts';
import { targetsOf } from './compaction-targets.ts';
import { Trail } from './compaction-trail.ts';

export type { CompactionDeps } from './compaction-deps.ts';

const LANE_BUSY_WHY = 'lane busy';

interface Link {
    readonly auto: boolean;
    readonly decision: string | null;
    readonly ceilingOverride: boolean;
}

interface Refusal {
    readonly stage: 'skipped' | 'failed';
    readonly reason: CompactFailure;
    readonly why: string;
    readonly toast: string;
}

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

    private async refusalOf(lane: Lane): Promise<Refusal | null> {
        const { compaction, badge } = this.deps.messages();
        const agent = String(lane.agent);
        const state = await this.deps.agents.status(String(lane.pane));
        if (isUnknown(state)) {
            const why = saying(state.why);
            return { stage: 'failed', reason: COMPACT_FAILURES.error, why, toast: compaction.failed(agent, why) };
        }
        if (READY.has(state.status)) return null;
        const reason = state.status === 'working' ? COMPACT_FAILURES.busy : COMPACT_FAILURES.skipped;
        return { stage: 'skipped', reason, why: badge[state.status], toast: compaction.skipped(agent, state.status) };
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

    private split(lanes: readonly Lane[], request: CompactRequest): { readonly owned: Lane[]; readonly held: Lane[] } {
        const owned: Lane[] = [];
        const held: Lane[] = [];
        for (const lane of lanes) {
            if (this.deps.claims.kindOf(String(lane.pane)) === 'handoff') {
                held.push(lane);
            } else if (this.claimed(lane, request)) {
                owned.push(lane);
            }
        }
        return { owned, held };
    }

    private recordRefusal(lane: Lane, tab: string, refusal: Refusal, origin: Origin, request: CompactRequest | null): void {
        const pane = String(lane.pane);
        const id = this.deps.compactions.begin({ tab, pane, agent: String(lane.agent), stage: refusal.stage, at: this.deps.now(), why: refusal.why, origin, answer: request?.answer ?? null });
        linkAsk(this.deps.asks, request, pane, id);
        this.deps.events?.lane(pane, COMPACT_EVENTS.failed, `${id}:${refusal.why}`);
        this.answer(request, pane, failureStage(refusal.reason));
    }

    private async refused(lane: Lane, tab: string, trail: Trail | null, origin: Origin = 'operator', request: CompactRequest | null = null): Promise<boolean> {
        const refusal = await this.refusalOf(lane);
        if (refusal === null) {
            return false;
        }
        if (trail === null) {
            this.recordRefusal(lane, tab, refusal, origin, request);
        } else {
            trail.end(refusal.stage, { why: refusal.why }, refusal.reason);
        }
        await this.tell(this.deps.messages().compaction.title(String(lane.agent)), refusal.toast);
        return true;
    }

    private async heldByHandoff(lane: Lane, tab: string, request: CompactRequest): Promise<void> {
        const agent = String(lane.agent);
        const refusal: Refusal = { stage: 'failed', reason: COMPACT_FAILURES.laneBusy, why: LANE_BUSY_WHY, toast: this.deps.messages().compaction.failed(agent, LANE_BUSY_WHY) };
        this.recordRefusal(lane, tab, refusal, request.origin ?? 'operator', request);
        await this.tell(this.deps.messages().compaction.title(agent), refusal.toast);
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
        const { auto, decision, ceilingOverride } = link;
        const first = await this.briefOf(lane, tab, material);
        if (!auto) return { brief: first, coverage: null, outcome: { kind: 'passed' }, coverageMs: 0, coverageCostUsd: null, why: null };
        const checked = await checkedBrief(this.deps, first, first.history, (correction) => this.briefOf(lane, tab, material, correction), ceilingOverride);
        const saved = this.rememberCoverage(decision, checked, first.history, ceilingOverride);
        const messages = this.deps.messages();
        const ceilingLine = ceilingOverride ? coverageLog(saved.outcome, messages) : null;
        if (ceilingLine !== null) this.deps.log(`autocompact ceiling: ${ceilingLine}`);
        if (decision !== null) this.deps.decisions?.amend(decision, { coverage: saved.coverage, outcome: saved.outcome, coverageMs: saved.coverageMs, coverageCostUsd: saved.coverageCostUsd, why: ceilingOverride ? coverageWhy(saved.outcome, saved.why, messages) : saved.why, block: !ceilingOverride });
        return saved;
    }

    private rememberCoverage(decision: string | null, checked: Checked, history: ReturnType<Ledger['historyOf']>, ceilingOverride: boolean): Checked {
        const checkedFacts: readonly CheckedFact[] = factsOf(history).flatMap((fact) => isSection(fact.section) ? [{ section: fact.section, text: fact.text, why: fact.why }] : []);
        const appended = ceilingOverride && checked.outcome.kind === 'missed' && checked.brief.text !== null
            ? appendedBrief(checked.brief.text, checked.outcome.facts, checkedFacts)
            : null;
        if (decision !== null && checked.brief.text !== null) this.deps.checkedBriefs?.put(decision, checked.brief.text, appended?.indexes ?? [], checkedFacts, this.deps.now());
        return appended === null ? checked : { ...checked, brief: { ...checked.brief, text: appended.text } };
    }

    private linkedDecision(auto: boolean, tab: string, pane: string, id: string): Link {
        const linked = auto ? this.deps.decisions?.linkLatest(tab, pane, id) ?? null : null;
        return { auto, decision: linked?.id ?? null, ceilingOverride: linked?.gate === 'ceiling' && this.deps.ceilingOverride?.() !== false };
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

    private async compact(lane: Lane, tab: string, request: CompactRequest): Promise<void> {
        const { compaction } = this.deps.messages();
        const [pane, agent, auto] = [String(lane.pane), String(lane.agent), request.origin === 'auto'];
        const writing = this.deps.brief.enabled();
        const id = this.begun(request, { tab, pane, agent, stage: writing ? 'briefing' : 'compacting', writer: this.deps.brief.job() });
        this.answer(request, pane, COMPACT_STAGES.running);
        this.deps.events?.lane(pane, COMPACT_EVENTS.running, id);
        const trail = new Trail(this.deps.compactions, id, () => this.deps.now(), (end, reason) => { this.ended(request, pane, id, end, reason); });
        const said = (text: string): string => (auto ? compaction.auto(text) : text);
        const beginning = writing ? compaction.writing(agent) : compaction.started(agent);
        await this.tell(said(compaction.title(agent)), said(beginning));
        const material = this.materialOf(tab, pane, request.note);
        const link = this.linkedDecision(auto, tab, pane, id);
        const checked = await this.verified(lane, tab, material, link);
        if (await this.stoppedByCoverage({ lane, checked, ceilingOverride: link.ceilingOverride, trail, said, messages: compaction })) return;
        const { brief } = checked;
        trail.to('compacting', { brief: brief.text === null ? 'template' : 'written', ...(brief.why === null ? {} : { templateWhy: brief.why }) });
        if (!(await this.refused(lane, tab, trail))) {
            const unsupported = await this.sender.send(lane, { material: { ...material, sections: clean(material.sections, brief.own) }, brief: brief.text }, trail);
            if (unsupported !== undefined) {
                const messages = this.deps.messages();
                await this.tell(messages.compaction.title(String(lane.agent)), messages.compaction.failed(String(lane.agent), unsupported.why));
            }
        }
    }

    private async stoppedByCoverage(parts: { readonly lane: Lane; readonly checked: Checked; readonly ceilingOverride: boolean; readonly trail: Trail; readonly said: (text: string) => string; readonly messages: Messages['compaction'] }): Promise<boolean> {
        const { lane, checked, ceilingOverride, trail, said, messages } = parts;
        if (!blockedByCoverage(checked, ceilingOverride)) return false;
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
        const { owned, held } = this.split(targets, request);
        try {
            await Promise.all(held.map((lane) => this.heldByHandoff(lane, tab, request)));
            if (owned.length === 0) {
                return;
            }
            const ready = (await Promise.all(owned.map(async (lane) => ((await this.refused(lane, tab, null, request.origin ?? 'operator', request)) ? [] : [lane])))).flat();
            if (ready.length === 0) {
                return;
            }
            await this.deps.refresh(tab, lanes);
            await Promise.all(ready.map((lane) => this.compact(lane, tab, request)));
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
