// Compacting an agent, once the operator asked: tell the agent what matters, in the operator's own words — and only when it is free.
// Every step is a stage of the lane's compaction record; the toasts say when it starts and when it ends.
import type { Lane } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { endAnswerOf, refusalAnswerOf } from '#src/recap/domain/compact-request.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { clean } from './compaction-brief.ts';
import { checkedBrief } from './compaction-coverage.ts';
import type { Briefed, Checked } from './compaction-coverage.ts';
import { compactionInput } from './compaction-input.ts';
import type { CompactionDeps } from './compaction-deps.ts';
import type { Material } from './compaction-message.ts';
import { Sender } from './compaction-send.ts';
import { targetsOf } from './compaction-targets.ts';
import { Trail } from './compaction-trail.ts';

export type { CompactionDeps } from './compaction-deps.ts';

const READY = new Set(['idle', 'done']);

/** Why a compaction does not happen: `skipped` (the agent is busy) or `failed` (herdr cannot say how it stands). */
interface Refusal {
    readonly stage: 'skipped' | 'failed';
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

    /** What stops the agent being compacted now; null when it is free. */
    private async refusalOf(lane: Lane): Promise<Refusal | null> {
        const { compaction, badge } = this.deps.messages();
        const agent = String(lane.agent);
        const state = await this.deps.agents.status(String(lane.pane));
        if (isUnknown(state)) {
            const why = saying(state.why);
            return { stage: 'failed', why, toast: compaction.failed(agent, why) };
        }
        return READY.has(state.status) ? null : { stage: 'skipped', why: badge[state.status], toast: compaction.skipped(agent, state.status) };
    }

    /** The request's answer on its pane, when it came from another tool. */
    private answer(request: CompactRequest | null, pane: string, stage: string): void {
        if (request?.answer !== undefined) {
            this.deps.answer?.(request.answer, pane, stage);
        }
    }

    /** A lane that is not free is recorded and said, once, and left alone. */
    private async refused(lane: Lane, tab: string, trail: Trail | null, origin: Origin = 'operator', request: CompactRequest | null = null): Promise<boolean> {
        const refusal = await this.refusalOf(lane);
        if (refusal === null) {
            return false;
        }
        if (trail === null) {
            const id = this.deps.compactions.begin({ tab, pane: String(lane.pane), agent: String(lane.agent), stage: refusal.stage, at: this.deps.now(), why: refusal.why, origin, answer: request?.answer ?? null });
            this.deps.events?.lane(String(lane.pane), 'compact-failed', `${id}:${refusal.why}`);
            this.answer(request, String(lane.pane), refusalAnswerOf(refusal.why));
        } else {
            trail.end(refusal.stage, { why: refusal.why });
        }
        await this.tell(this.deps.messages().compaction.title(String(lane.agent)), refusal.toast);
        return true;
    }

    private materialOf(tab: string, pane: string, note: string | null): Material {
        const tasks = this.deps.records.readRecap(tab)?.tasks ?? [];
        const task = tasks.find((each) => each.lanes.includes(pane)) ?? tasks[0];
        return { sections: task?.sections ?? NO_SECTIONS, web: this.deps.webs.of(pane), note };
    }

    /** What the brief job is given, and what the agent's own conversation says (the words it may use). */
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

    /** The brief, and for an automatic compaction its check against the facts; the decision it answers is told the coverage, and that it waits (with why) when the brief cannot go ahead. The operator's is not checked. */
    private async verified(lane: Lane, tab: string, material: Material, auto: boolean, decision: string | null): Promise<Checked> {
        const first = await this.briefOf(lane, tab, material);
        if (!auto) return { brief: first, coverage: null, waited: false, why: null };
        const checked = await checkedBrief(this.deps, first, first.history, (correction) => this.briefOf(lane, tab, material, correction));
        if (decision !== null) this.deps.decisions?.amend(decision, checked.coverage, checked.waited, checked.why);
        return checked;
    }

    /** The decision an automatic compaction answers, now pointing at the compaction `id`; null for the operator's. */
    private decisionFor(auto: boolean, tab: string, pane: string, id: string): string | null {
        return auto ? this.deps.decisions?.linkLatest(tab, pane, id) ?? null : null;
    }

    /** The compaction's record begins, and the event says it is queued with its id. */
    private begun(request: CompactRequest, start: { readonly tab: string; readonly pane: string; readonly agent: string; readonly stage: 'briefing' | 'compacting'; readonly writer: string | null }): string {
        const id = this.deps.compactions.begin({ ...start, at: this.deps.now(), origin: request.origin ?? 'operator', answer: request.answer ?? null });
        this.deps.events?.lane(start.pane, 'compact-queued', id);
        return id;
    }

    /** How a compaction ended, as the request's answer and as the event stream. */
    private ended(request: CompactRequest, pane: string, id: string, end: { readonly stage: string; readonly why?: string | null }): void {
        this.answer(request, pane, endAnswerOf(end.stage, end.why ?? null));
        this.deps.events?.lane(pane, end.stage === 'compacted' ? 'compact-done' : 'compact-failed', end.stage === 'compacted' ? id : `${id}:${end.why ?? end.stage}`);
    }

    /** One free agent, from the first stage to the last. */
    private async compact(lane: Lane, tab: string, request: CompactRequest): Promise<void> {
        const { compaction } = this.deps.messages();
        const [pane, agent, auto] = [String(lane.pane), String(lane.agent), request.origin === 'auto'];
        const writing = this.deps.brief.enabled();
        const id = this.begun(request, { tab, pane, agent, stage: writing ? 'briefing' : 'compacting', writer: this.deps.brief.job() });
        this.answer(request, pane, 'running');
        this.deps.events?.lane(pane, 'compact-running', id);
        const trail = new Trail(this.deps.compactions, id, () => this.deps.now(), (end) => { this.ended(request, pane, id, end); });
        const said = (text: string): string => (auto ? compaction.auto(text) : text);
        const beginning = writing ? compaction.writing(agent) : compaction.started(agent);
        await this.tell(said(compaction.title(agent)), said(beginning));
        const material = this.materialOf(tab, pane, request.note);
        const checked = await this.verified(lane, tab, material, auto, this.decisionFor(auto, tab, pane, id));
        if (checked.waited) {
            trail.end('skipped', { why: 'coverage' });
            await this.tell(said(compaction.title(agent)), compaction.coverageMissed(agent));
            return;
        }
        const { brief } = checked;
        trail.to('compacting', { brief: brief.text === null ? 'template' : 'written', ...(brief.why === null ? {} : { templateWhy: brief.why }) });
        if (!(await this.refused(lane, tab, trail))) {
            await this.sender.send(lane, { material: { ...material, sections: clean(material.sections, brief.own) }, brief: brief.text }, trail);
        }
    }

    async run(request: CompactRequest): Promise<void> {
        const { tab } = request;
        const lanes = this.deps.lanes(tab);
        const targets = targetsOf(lanes, this.deps.target(), { pane: request.pane, focused: await this.deps.focused(tab) });
        if (targets.length === 0) {
            this.answer(request, request.pane ?? '', 'failed-no-target');
            await this.tell(this.deps.messages().compaction.title(tab), this.deps.messages().compaction.nothing);
            return;
        }
        const ready = (await Promise.all(targets.map(async (lane) => ((await this.refused(lane, tab, null, request.origin ?? 'operator', request)) ? [] : [lane])))).flat();
        if (ready.length === 0) {
            return;
        }
        await this.deps.refresh(tab, lanes);
        await Promise.all(ready.map((lane) => this.compact(lane, tab, request)));
    }
}
