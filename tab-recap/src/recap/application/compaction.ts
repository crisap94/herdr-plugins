import type { Lane } from '#src/recap/domain/lane.ts';
import type { Messages } from '#src/i18n/index.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { endAnswerOf, refusalAnswerOf } from '#src/recap/domain/compact-request.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { clean } from './compaction-brief.ts';
import { checkedBrief } from './compaction-coverage.ts';
import { factsOf } from './brief-coverage.ts';
import { isSection } from '#src/recap/domain/fact.ts';
import type { Briefed, Checked } from './compaction-coverage.ts';
import { compactionInput } from './compaction-input.ts';
import type { CompactionDeps } from './compaction-deps.ts';
import type { Material } from './compaction-message.ts';
import { Sender } from './compaction-send.ts';
import { targetsOf } from './compaction-targets.ts';
import { Trail } from './compaction-trail.ts';

export type { CompactionDeps } from './compaction-deps.ts';

const READY = new Set(['idle', 'done']);
const APPEND_ORDER = ['goal', 'rules', 'needs', 'decisions'] as const;

function appendedBrief(text: string, facts: Extract<Checked['outcome'], { readonly kind: 'missed' }>['facts'], checkedFacts: readonly import('#src/recap/domain/autocompact.ts').CheckedFact[]): { readonly text: string; readonly indexes: readonly number[] } {
    const ordered = [...facts].toSorted((a, b) => APPEND_ORDER.indexOf(a.section as (typeof APPEND_ORDER)[number]) - APPEND_ORDER.indexOf(b.section as (typeof APPEND_ORDER)[number]));
    const lines = ordered.map((fact) => `${fact.section}: ${fact.text}${fact.section === 'decisions' && fact.why !== null ? ` — ${fact.why}` : ''}`);
    const picked = lines.map((_, at) => at);
    let block = '';
    while (block.length === 0 || block.length > 1500) {
        const heading = `\n\nFacts not carried into the brief (${facts.length} missed; ${lines.length - picked.length} left out):`;
        block = `${heading}${picked.map((at) => `\n- ${lines[at] ?? ''}`).join('')}`;
        if (block.length <= 1500 || picked.length === 0) break;
        picked.pop();
    }
    const indexes = picked.map((at) => {
        const fact = ordered[at];
        return fact === undefined ? -1 : checkedFacts.findIndex((candidate) => candidate.section === fact.section && candidate.text === fact.text && candidate.why === fact.why);
    }).filter((at) => at >= 0);
    return { text: `${text}${block}`, indexes };
}

function coverageWhy(outcome: Checked['outcome'], why: string | null, messages: Messages): string | null {
    if (outcome.kind === 'missed') return messages.compaction.coverageCeiling(outcome.facts.length);
    if (outcome.kind === 'unchecked') return `${messages.compaction.coverageUnchecked(outcome.reason)}; ceiling override`;
    return why;
}

function coverageLog(outcome: Checked['outcome'], messages: Messages): string {
    if (outcome.kind === 'missed') return messages.compaction.coverageCeiling(outcome.facts.length);
    if (outcome.kind === 'unchecked') return messages.compaction.coverageUnchecked(outcome.reason);
    return messages.compaction.coveragePassed;
}

function blockedByCoverage(checked: Checked, ceilingOverride: boolean): boolean {
    return !ceilingOverride && (checked.outcome.kind === 'unchecked' || checked.outcome.kind === 'missed');
}

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
        this.answerOne(request, pane, 'queued');
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

    private async verified(lane: Lane, tab: string, material: Material, auto: boolean, decision: string | null): Promise<Checked> {
        const first = await this.briefOf(lane, tab, material);
        if (!auto) return { brief: first, coverage: null, outcome: { kind: 'passed' }, coverageMs: 0, coverageCostUsd: null, why: null };
        const checked = await checkedBrief(this.deps, first, first.history, (correction) => this.briefOf(lane, tab, material, correction));
        const ceilingOverride = this.ceilingOverride(tab, String(lane.pane));
        const saved = this.rememberCoverage(decision, checked, first.history, ceilingOverride);
        const messages = this.deps.messages();
        const why = ceilingOverride ? coverageWhy(saved.outcome, saved.why, messages) : saved.why;
        if (ceilingOverride) this.deps.log(`autocompact ceiling: ${coverageLog(saved.outcome, messages)}`);
        if (decision !== null) this.deps.decisions?.amend(decision, { coverage: saved.coverage, outcome: saved.outcome, coverageMs: saved.coverageMs, coverageCostUsd: saved.coverageCostUsd, why, block: !ceilingOverride });
        return saved;
    }

    private ceilingOverride(tab: string, pane: string): boolean {
        return this.deps.ceilingOverride?.() !== false && this.deps.decisions?.lastDecision(tab, pane)?.gate === 'ceiling';
    }

    private rememberCoverage(decision: string | null, checked: Checked, history: ReturnType<Ledger['historyOf']>, ceilingOverride: boolean): Checked {
        const checkedFacts = checked.outcome.kind === 'unchecked' ? [] : factsOf(history).flatMap((fact) => isSection(fact.section) ? [{ section: fact.section, text: fact.text, why: fact.why }] : []);
        if (decision !== null && checked.brief.text !== null) this.deps.checkedBriefs?.put(decision, checked.brief.text, [], checkedFacts, this.deps.now());
        if (!ceilingOverride || checked.outcome.kind !== 'missed' || checked.brief.text === null) return checked;
        const appended = appendedBrief(checked.brief.text, checked.outcome.facts, checkedFacts);
        const found = { ...checked, brief: { ...checked.brief, text: appended.text } };
        if (decision !== null) this.deps.checkedBriefs?.put(decision, appended.text, appended.indexes, checkedFacts, this.deps.now());
        return found;
    }

    private decisionFor(auto: boolean, tab: string, pane: string, id: string): string | null {
        return auto ? this.deps.decisions?.linkLatest(tab, pane, id) ?? null : null;
    }

    private begun(request: CompactRequest, start: { readonly tab: string; readonly pane: string; readonly agent: string; readonly stage: 'briefing' | 'compacting'; readonly writer: string | null }): string {
        const id = this.deps.compactions.begin({ ...start, at: this.deps.now(), origin: request.origin ?? 'operator', answer: request.answer ?? null });
        this.deps.events?.lane(start.pane, 'compact-queued', id);
        return id;
    }

    private ended(request: CompactRequest, pane: string, id: string, end: { readonly stage: string; readonly why?: string | null }): void {
        this.answer(request, pane, endAnswerOf(end.stage, end.why ?? null));
        this.deps.events?.lane(pane, end.stage === 'compacted' ? 'compact-done' : 'compact-failed', end.stage === 'compacted' ? id : `${id}:${end.why ?? end.stage}`);
    }

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
        if (await this.stoppedByCoverage({ lane, tab, checked, trail, said, messages: compaction })) return;
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

    private async stoppedByCoverage(parts: { readonly lane: Lane; readonly tab: string; readonly checked: Checked; readonly trail: Trail; readonly said: (text: string) => string; readonly messages: Messages['compaction'] }): Promise<boolean> {
        const { lane, tab, checked, trail, said, messages } = parts;
        if (!blockedByCoverage(checked, this.ceilingOverride(tab, String(lane.pane)))) return false;
        trail.end('skipped', { why: 'coverage' });
        await this.tell(said(messages.title(String(lane.agent))), messages.coverageMissed(String(lane.agent)));
        return true;
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
        const owned = targets.filter((lane) => this.claimed(lane, request));
        if (owned.length === 0) {
            return;
        }
        try {
            const ready = (await Promise.all(owned.map(async (lane) => ((await this.refused(lane, tab, null, request.origin ?? 'operator', request)) ? [] : [lane])))).flat();
            if (ready.length === 0) {
                return;
            }
            await this.deps.refresh(tab, lanes);
            await Promise.all(ready.map((lane) => this.compact(lane, tab, request)));
        } catch (error) {
            for (const lane of owned) {
                this.answer(request, String(lane.pane), 'failed-error');
            }
            throw error;
        } finally {
            for (const lane of owned) {
                this.deps.claims.release(String(lane.pane));
            }
        }
    }
}
