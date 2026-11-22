import { knownOr } from '#src/ports/guarded-reads.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { LinkedDecision } from '#src/ports/autocompact-records.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { LANE_CLOSED } from '#src/recap/domain/lane-closed.ts';
import type { ClosePoint } from '#src/recap/domain/lane-closed.ts';
import { type CompactionId, type DecisionId, type PaneId, type TabId, paneId } from '#src/recap/domain/ids.ts';
import { type CheckedFact, type MissedFacts } from '#src/recap/domain/autocompact.ts';
import { MISSED_FACTS_DEFAULT } from '#src/recap/domain/autocompact.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { must } from '#src/protocol/result.ts';
import { duration, instant } from '#src/recap/domain/time.ts';
import { appendedBrief, checkedBrief } from './compaction-coverage.ts';
import type { Briefed, Checked, CoverageFlow } from './compaction-coverage.ts';
import { checkedFactsOf } from './brief-coverage.ts';
import { blockedByCoverage, coverageLog, coverageWhy } from './coverage-verdict.ts';
import { compactionMaterialInput } from './compaction-material.ts';
import type { CompactionPorts } from './compaction-deps.ts';
import type { Material } from './compaction-message.ts';

export type Trigger = 'auto' | 'operator';

export interface Link {
    readonly trigger: Trigger;
    readonly decision: DecisionId | null;
    readonly flow: CoverageFlow;
}

export type Verified = { readonly kind: 'checked'; readonly checked: Checked } | { readonly kind: 'closed'; readonly at: ClosePoint };

type History = ReturnType<Ledger['historyOf']>;

export interface Drafted extends Briefed {
    readonly history: History;
}

export class Briefing {
    private readonly deps: CompactionPorts;

    constructor(deps: CompactionPorts) {
        this.deps = deps;
    }

    materialOf(tab: TabId, pane: PaneId, note: Text | null): Material {
        const tasks = knownOr(this.deps.records.readRecap(tab), null)?.tasks ?? [];
        const task = tasks.find((each) => each.lanes.includes(pane)) ?? tasks[0];
        return { sections: task?.sections ?? NO_SECTIONS, web: this.deps.webs.of(pane), note };
    }

    private async briefOf(lane: Lane, tab: TabId, material: Material, correction?: Text): Promise<Drafted> {
        const { brief, records, ledger } = this.deps;
        const [pane, agent] = [String(lane.pane), String(lane.agent)];
        const [recent, history]: [readonly Entry[], History] = [await this.deps.recent(lane), ledger.historyOf(tab, paneId(pane))];
        const own = must(parseText([...recent.map((entry) => entry.text), ...history.flatMap((item) => [item.text, item.why ?? ''])].join('\n')));
        if (brief.enabled() === 'absent') {
            return { text: null, why: null, own, history };
        }
        const label = knownOr(records.readRecap(tab), null)?.lanes.find((each) => each.pane === pane)?.title ?? lane.title ?? '';
        const clock = { now: this.deps.now(), zone: textOf(Intl.DateTimeFormat().resolvedOptions().timeZone) };
        const broke = this.deps.boundaries.lastBreakAt(tab, pane);
        const document = compactionMaterialInput({ agent: { kind: textOf(agent), label: textOf(label), repo: null, branch: null }, note: material.note, current: material.sections, history, lastBreakAt: broke === null ? null : instant(broke), recent, clock });
        return { ...(await brief.write(document, own, correction)), own, history };
    }

    async verified(lane: Lane, tab: TabId, material: Material, link: Link): Promise<Verified> {
        const { trigger, decision, flow } = link;
        const first = await this.briefOf(lane, tab, material);
        if (trigger === 'operator') return { kind: 'checked', checked: { brief: first, coverage: null, outcome: { kind: 'passed' }, coverageMs: duration(0), coverageCostUsd: null, why: null } };
        if (this.listed(lane) === 'absent') return { kind: 'closed', at: 'after-writer' };
        const stop: { at: ClosePoint | null } = { at: null };
        const rewrite = async (correction: Text): Promise<Briefed> => {
            if (this.listed(lane) === 'present') return this.briefOf(lane, tab, material, correction);
            stop.at = 'before-rewrite';
            return { text: null, why: must(parseText(LANE_CLOSED)), own: first.own };
        };
        const checked = await checkedBrief(this.deps, first, first.history, rewrite, flow);
        if (stop.at !== null) return { kind: 'closed', at: stop.at };
        const saved = this.rememberCoverage(decision, checked, first.history, flow);
        this.recordCoverage(decision, flow, saved);
        return { kind: 'checked', checked: saved };
    }

    private recordCoverage(decision: DecisionId | null, flow: CoverageFlow, saved: Checked): void {
        const messages = this.deps.messages();
        const blocked = blockedByCoverage(saved, flow) === 'present';
        const line = flow.appends === 'present' ? coverageLog(saved.outcome, messages) : null;
        if (line !== null) this.deps.log(must(parseText(`${flow.atCeiling === 'present' ? 'autocompact ceiling' : 'autocompact'}: ${line}`)));
        if (decision !== null) this.deps.decisions?.amend(decision, { coverage: saved.coverage === null ? null : Object.fromEntries(saved.coverage), outcome: saved.outcome, coverageMs: saved.coverageMs, coverageCostUsd: saved.coverageCostUsd, why: blocked ? saved.why : coverageWhy(saved.outcome, saved.why, messages), block: blocked });
    }

    private rememberCoverage(decision: DecisionId | null, checked: Checked, history: History, flow: CoverageFlow): Checked {
        const checkedFacts: readonly CheckedFact[] = checkedFactsOf(history);
        const appended = flow.appends === 'present' && checked.outcome.kind === 'missed' && checked.brief.text !== null
            ? appendedBrief(checked.brief.text, checked.outcome.facts, checkedFacts)
            : null;
        if (decision !== null && checked.brief.text !== null) this.deps.checkedBriefs?.put(decision, checked.brief.text, appended?.indexes ?? [], checkedFacts, this.deps.now());
        return appended === null ? checked : { ...checked, brief: { ...checked.brief, text: appended.text } };
    }

    linkedDecision(trigger: Trigger, tab: TabId, pane: PaneId, id: CompactionId): Link {
        const linked = trigger === 'auto' ? this.deps.decisions?.linkLatest(tab, pane, id) ?? null : null;
        return { trigger, decision: linked?.id ?? null, flow: this.flowOf(linked?.gate) };
    }

    private flowOf(gate: LinkedDecision['gate'] | undefined): CoverageFlow {
        const atCeiling = gate === 'ceiling' && this.deps.ceilingOverride?.() !== 'absent';
        const missedFacts: MissedFacts = this.deps.missedFacts?.() ?? MISSED_FACTS_DEFAULT;
        const appends = atCeiling || missedFacts === 'append';
        return { atCeiling: atCeiling ? 'present' : 'absent', appends: appends ? 'present' : 'absent' };
    }

    listed(lane: Lane): Presence {
        return this.deps.listsPane(lane.pane);
    }
}
