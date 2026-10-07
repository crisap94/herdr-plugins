// Compacting an agent, once the operator asked: tell the agent what matters, in the operator's own words — and only when it is free.
import type { Messages } from '#src/i18n/index.ts';
import type { CompactTarget } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { Agents, Prompted } from '#src/ports/agents.ts';
import type { Notifier } from '#src/ports/notifier.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import type { Entry, Mark } from '#src/ports/transcripts.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { outcomeOf } from './compaction-outcome.ts';
import type { Outcome } from './compaction-outcome.ts';
import { compactionInput } from './compaction-input.ts';
import { guidanceOf, restoreFrom, restoreOf } from './compaction-message.ts';
import type { Material } from './compaction-message.ts';
import { targetsOf } from './compaction-targets.ts';

export interface CompactionDeps {
    readonly agents: Agents;
    readonly notifier: Notifier;
    readonly records: Pick<RecapRecords, 'readRecap' | 'readHistory'>;
    /** writes the brief from a document; null when it is off or gave none (the template is used) */
    readonly brief: { enabled(): boolean; write(document: string): Promise<string | null> };
    /** the agent's last turns, read from its own records; empty when they cannot be read */
    recent(lane: Lane): Promise<readonly Entry[]>;
    /** the compactions the agent's own records show, newest last; empty when they cannot be read */
    marks(lane: Lane): Promise<readonly Mark[]>;
    pause(ms: number): Promise<void>;
    now(): number;
    readonly webs: { of(pane: string): LaneWeb | null };
    /** the lanes the daemon holds for the tab */
    lanes(tab: string): readonly Lane[];
    /** the pane herdr focuses in the tab */
    focused(tab: string): Promise<string | null>;
    /** the tab's recap, written now and awaited; it never rejects (a failed or slow one leaves the last good recap) */
    refresh(tab: string, lanes: readonly Lane[]): Promise<void>;
    target(): CompactTarget;
    messages(): Messages;
    log(line: string): void;
}

/** A compaction that has to finish before the restore message is sent: the longest the agent is waited for. */
const COMPACTING_MS = 10 * 60_000;
const READY = new Set(['idle', 'done']);

export class Compaction {
    private readonly deps: CompactionDeps;

    constructor(deps: CompactionDeps) {
        this.deps = deps;
    }

    private async tell(title: string, body: string): Promise<void> {
        const shown = await this.deps.notifier.notify(title, body);
        if (isUnknown(shown)) {
            this.deps.log(`compaction: toast not shown (${saying(shown.why)})`);
        }
    }

    /** Whether the agent is free now: said, with the reason when it is not. */
    private async free(lane: Lane): Promise<boolean> {
        const { compaction } = this.deps.messages();
        const state = await this.deps.agents.status(String(lane.pane));
        if (isUnknown(state)) {
            await this.tell(compaction.title(String(lane.agent)), compaction.failed(String(lane.agent), saying(state.why)));
            return false;
        }
        if (!READY.has(state.status)) {
            await this.tell(compaction.title(String(lane.agent)), compaction.skipped(String(lane.agent), state.status));
        }
        return READY.has(state.status);
    }

    private materialOf(tab: string, pane: string, note: string | null): Material {
        const tasks = this.deps.records.readRecap(tab)?.tasks ?? [];
        const task = tasks.find((each) => each.lanes.includes(pane)) ?? tasks[0];
        return { sections: task?.sections ?? NO_SECTIONS, web: this.deps.webs.of(pane), note };
    }

    /** What the agent's own summary should keep, written from the whole session; null when no brief was written (the template is used). */
    private async briefOf(lane: Lane, tab: string, material: Material): Promise<string | null> {
        const { brief, records } = this.deps;
        if (!brief.enabled()) {
            return null;
        }
        const [pane, agent] = [String(lane.pane), String(lane.agent)];
        await this.tell(this.deps.messages().compaction.title(agent), this.deps.messages().compaction.writing(agent));
        const label = records.readRecap(tab)?.lanes.find((each) => each.pane === pane)?.title ?? lane.title ?? '';
        const clock = { now: this.deps.now(), zone: Intl.DateTimeFormat().resolvedOptions().timeZone };
        return brief.write(compactionInput({ agent: { kind: agent, label, repo: null, branch: null }, note: material.note, current: material.sections, history: records.readHistory(tab, pane), recent: await this.deps.recent(lane), clock }));
    }

    /** One go at the compaction command: typed, announced (the first time), then confirmed from the agent's own records. */
    private async attempt(lane: Lane, command: () => Promise<Prompted>, announce: boolean): Promise<{ readonly sent: Prompted; readonly outcome: Outcome | null }> {
        const agent = String(lane.agent);
        const since = this.deps.now();
        const sent = await command();
        if (sent.kind !== 'sent') {
            return { sent, outcome: null };
        }
        if (announce) {
            await this.tell(this.deps.messages().compaction.title(agent), this.deps.messages().compaction.started(agent));
        }
        return { sent, outcome: await outcomeOf(this.deps, lane, since, agent === 'claude') };
    }

    /** The one place anything is typed into an agent: claude takes `/compact ` and then its guidance, typed in two pieces (once more when its own summarizer failed); the others are compacted, then reminded. */
    private async send(lane: Lane, material: Material, brief: string | null): Promise<void> {
        const [pane, agent] = [String(lane.pane), String(lane.agent)];
        const { compaction } = this.deps.messages();
        const typed = agent === 'claude';
        const command = (): Promise<Prompted> => (typed
            ? this.deps.agents.typeLine(pane, ['/compact ', brief ?? guidanceOf(material)])
            : this.deps.agents.prompt(pane, '/compact', { until: ['idle', 'done'], timeoutMs: COMPACTING_MS }));
        let tried = await this.attempt(lane, command, true);
        const retried = typed && tried.outcome === 'failed';
        tried = retried ? await this.attempt(lane, command, false) : tried;
        if (tried.sent.kind !== 'sent') {
            await this.tell(compaction.title(agent), compaction.failed(agent, tried.sent.kind === 'blocked' ? this.deps.messages().badge.blocked : saying(tried.sent.why)));
            return;
        }
        if (!typed && tried.outcome !== 'failed') {
            await this.deps.agents.prompt(pane, brief === null ? restoreOf(material) : restoreFrom(brief));
        }
        await this.tell(compaction.title(agent), compaction.outcome(agent, tried.outcome ?? 'unconfirmed', retried));
    }

    async run(request: CompactRequest): Promise<void> {
        const { tab } = request;
        const lanes = this.deps.lanes(tab);
        const targets = targetsOf(lanes, this.deps.target(), { pane: request.pane, focused: await this.deps.focused(tab) });
        if (targets.length === 0) {
            await this.tell(this.deps.messages().compaction.title(tab), this.deps.messages().compaction.nothing);
            return;
        }
        const ready = (await Promise.all(targets.map(async (lane) => ((await this.free(lane)) ? [lane] : [])))).flat();
        if (ready.length === 0) {
            return;
        }
        await this.deps.refresh(tab, lanes);
        await Promise.all(ready.map(async (lane) => {
            const material = this.materialOf(tab, String(lane.pane), request.note);
            const brief = await this.briefOf(lane, tab, material);
            if (await this.free(lane)) {
                await this.send(lane, material, brief);
            }
        }));
    }
}
