// Compacting an agent, once the operator asked: tell the agent what matters, in the operator's own words — and only when it is free.
import type { Messages } from '#src/i18n/index.ts';
import type { CompactTarget } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { Agents } from '#src/ports/agents.ts';
import type { Notifier } from '#src/ports/notifier.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { guidanceOf, restoreOf } from './compaction-message.ts';
import type { Material } from './compaction-message.ts';
import { targetsOf } from './compaction-targets.ts';

export interface CompactionDeps {
    readonly agents: Agents;
    readonly notifier: Notifier;
    readonly records: Pick<RecapRecords, 'readRecap'>;
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

    /** The one place anything is typed into an agent: claude takes instructions with `/compact`; the others are compacted, then reminded. */
    private async send(lane: Lane, material: Material): Promise<void> {
        const [pane, agent] = [String(lane.pane), String(lane.agent)];
        const { compaction } = this.deps.messages();
        const first = agent === 'claude'
            ? await this.deps.agents.typeLine(pane, `/compact ${guidanceOf(material)}`)
            : await this.deps.agents.prompt(pane, '/compact', { until: ['idle', 'done'], timeoutMs: COMPACTING_MS });
        const second = first.kind === 'sent' && agent !== 'claude' ? await this.deps.agents.prompt(pane, restoreOf(material)) : first;
        if (second.kind === 'sent') {
            await this.tell(compaction.title(agent), compaction.started(agent));
            return;
        }
        await this.tell(compaction.title(agent), compaction.failed(agent, second.kind === 'blocked' ? this.deps.messages().badge.blocked : saying(second.why)));
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
            if (await this.free(lane)) {
                await this.send(lane, this.materialOf(tab, String(lane.pane), request.note));
            }
        }));
    }
}
