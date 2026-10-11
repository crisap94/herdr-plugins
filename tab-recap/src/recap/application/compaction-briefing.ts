import type { Lane } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { LinkedDecision } from '#src/ports/autocompact-records.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { LANE_CLOSED } from '#src/recap/domain/lane-closed.ts';
import type { ClosePoint } from '#src/recap/domain/lane-closed.ts';
import { isSection } from '#src/recap/domain/fact.ts';
import type { CheckedFact, MissedFacts } from '#src/recap/domain/autocompact.ts';
import { MISSED_FACTS_DEFAULT } from '#src/recap/domain/autocompact.ts';
import { appendedBrief, checkedBrief } from './compaction-coverage.ts';
import type { Briefed, Checked, CoverageFlow } from './compaction-coverage.ts';
import { factsOf } from './brief-coverage.ts';
import { blockedByCoverage, coverageLog, coverageWhy } from './coverage-verdict.ts';
import { compactionInput } from './compaction-input.ts';
import type { CompactionDeps } from './compaction-deps.ts';
import type { Material } from './compaction-message.ts';

export interface Link {
    readonly auto: boolean;
    readonly decision: string | null;
    readonly flow: CoverageFlow;
}

export type Verified = { readonly kind: 'checked'; readonly checked: Checked } | { readonly kind: 'closed'; readonly at: ClosePoint };

export class Briefing {
    private readonly deps: CompactionDeps;

    constructor(deps: CompactionDeps) {
        this.deps = deps;
    }

    materialOf(tab: string, pane: string, note: string | null): Material {
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

    async verified(lane: Lane, tab: string, material: Material, link: Link): Promise<Verified> {
        const { auto, decision, flow } = link;
        const first = await this.briefOf(lane, tab, material);
        if (!auto) return { kind: 'checked', checked: { brief: first, coverage: null, outcome: { kind: 'passed' }, coverageMs: 0, coverageCostUsd: null, why: null } };
        if (!this.listed(lane)) return { kind: 'closed', at: 'after-writer' };
        const stop: { at: ClosePoint | null } = { at: null };
        const rewrite = async (correction: string): Promise<Briefed> => {
            if (this.listed(lane)) return this.briefOf(lane, tab, material, correction);
            stop.at = 'before-rewrite';
            return { text: null, why: LANE_CLOSED, own: first.own };
        };
        const checked = await checkedBrief(this.deps, first, first.history, rewrite, flow);
        if (stop.at !== null) return { kind: 'closed', at: stop.at };
        const saved = this.rememberCoverage(decision, checked, first.history, flow);
        const messages = this.deps.messages();
        const blocked = blockedByCoverage(saved, flow);
        const line = flow.appends ? coverageLog(saved.outcome, messages) : null;
        if (line !== null) this.deps.log(`${flow.atCeiling ? 'autocompact ceiling' : 'autocompact'}: ${line}`);
        if (decision !== null) this.deps.decisions?.amend(decision, { coverage: saved.coverage, outcome: saved.outcome, coverageMs: saved.coverageMs, coverageCostUsd: saved.coverageCostUsd, why: blocked ? saved.why : coverageWhy(saved.outcome, saved.why, messages), block: blocked });
        return { kind: 'checked', checked: saved };
    }

    private rememberCoverage(decision: string | null, checked: Checked, history: ReturnType<Ledger['historyOf']>, flow: CoverageFlow): Checked {
        const checkedFacts: readonly CheckedFact[] = factsOf(history).flatMap((fact) => isSection(fact.section) ? [{ section: fact.section, text: fact.text, why: fact.why }] : []);
        const appended = flow.appends && checked.outcome.kind === 'missed' && checked.brief.text !== null
            ? appendedBrief(checked.brief.text, checked.outcome.facts, checkedFacts)
            : null;
        if (decision !== null && checked.brief.text !== null) this.deps.checkedBriefs?.put(decision, checked.brief.text, appended?.indexes ?? [], checkedFacts, this.deps.now());
        return appended === null ? checked : { ...checked, brief: { ...checked.brief, text: appended.text } };
    }

    linkedDecision(auto: boolean, tab: string, pane: string, id: string): Link {
        const linked = auto ? this.deps.decisions?.linkLatest(tab, pane, id) ?? null : null;
        return { auto, decision: linked?.id ?? null, flow: this.flowOf(linked?.gate) };
    }

    private flowOf(gate: LinkedDecision['gate'] | undefined): CoverageFlow {
        const atCeiling = gate === 'ceiling' && this.deps.ceilingOverride?.() !== false;
        const missedFacts: MissedFacts = this.deps.missedFacts?.() ?? MISSED_FACTS_DEFAULT;
        return { atCeiling, appends: atCeiling || missedFacts === 'append' };
    }

    listed(lane: Lane): boolean {
        return this.deps.listsPane(String(lane.pane));
    }
}
