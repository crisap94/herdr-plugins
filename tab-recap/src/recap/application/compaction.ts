// Compacting an agent, once the operator asked: tell the agent what matters, in the operator's own words — and only when it is free.
// Every step is a stage of the lane's compaction record; the toasts say when it starts and when it ends.
import type { Lane } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { clean } from './compaction-brief.ts';
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

    /** A lane that is not free is recorded and said, once, and left alone. */
    private async refused(lane: Lane, tab: string, trail: Trail | null): Promise<boolean> {
        const refusal = await this.refusalOf(lane);
        if (refusal === null) {
            return false;
        }
        if (trail === null) {
            this.deps.compactions.begin({ tab, pane: String(lane.pane), agent: String(lane.agent), stage: refusal.stage, at: this.deps.now(), why: refusal.why });
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
    private async briefOf(lane: Lane, tab: string, material: Material): Promise<{ readonly text: string | null; readonly why: string | null; readonly own: string }> {
        const { brief, records, ledger } = this.deps;
        const [pane, agent] = [String(lane.pane), String(lane.agent)];
        const [recent, history]: [readonly Entry[], ReturnType<typeof ledger.historyOf>] = [await this.deps.recent(lane), ledger.historyOf(tab, pane)];
        const own = [...recent.map((entry) => entry.text), ...history.flatMap((item) => [item.text, item.why ?? ''])].join('\n');
        if (!brief.enabled()) {
            return { text: null, why: null, own };
        }
        const label = records.readRecap(tab)?.lanes.find((each) => each.pane === pane)?.title ?? lane.title ?? '';
        const clock = { now: this.deps.now(), zone: Intl.DateTimeFormat().resolvedOptions().timeZone };
        const document = compactionInput({ agent: { kind: agent, label, repo: null, branch: null }, note: material.note, current: material.sections, history, recent, clock });
        return { ...(await brief.write(document, own)), own };
    }

    /** One free agent, from the first stage to the last. */
    private async compact(lane: Lane, tab: string, note: string | null): Promise<void> {
        const { compaction } = this.deps.messages();
        const [pane, agent] = [String(lane.pane), String(lane.agent)];
        const writing = this.deps.brief.enabled();
        const id = this.deps.compactions.begin({ tab, pane, agent, stage: writing ? 'briefing' : 'compacting', at: this.deps.now(), writer: this.deps.brief.job() });
        const trail = new Trail(this.deps.compactions, id, () => this.deps.now());
        await this.tell(compaction.title(agent), writing ? compaction.writing(agent) : compaction.started(agent));
        const material = this.materialOf(tab, pane, note);
        const brief = await this.briefOf(lane, tab, material);
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
            await this.tell(this.deps.messages().compaction.title(tab), this.deps.messages().compaction.nothing);
            return;
        }
        const ready = (await Promise.all(targets.map(async (lane) => ((await this.refused(lane, tab, null)) ? [] : [lane])))).flat();
        if (ready.length === 0) {
            return;
        }
        await this.deps.refresh(tab, lanes);
        await Promise.all(ready.map((lane) => this.compact(lane, tab, request.note)));
    }
}
