import type { LiveLanes, LiveLanesRead, TabViewRecord, TabViewStore } from '#src/ports/tab-views.ts';
import type { RestoredLane } from '#src/recap/domain/closures.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { directoryOf } from './closed-values.ts';

export class MemoryTabViews implements Pick<TabViewStore, 'writeTab' | 'tabOf'>, LiveLanes {
    private readonly tabs = new Map<TabId, TabViewRecord>();

    writeTab(view: TabViewRecord): void {
        this.tabs.set(view.tab, view);
    }

    tabOf(pane: PaneId): TabId | null {
        return [...this.tabs.values()].find((view) => view.lanes.some((lane) => lane.pane === pane))?.tab ?? null;
    }

    liveLanes(): LiveLanesRead {
        const lanes: RestoredLane[] = [...this.tabs.keys()].toSorted().flatMap((tab) => (this.tabs.get(tab)?.lanes ?? []).map((lane) => ({
            tab, pane: lane.pane, agent: lane.agent, since: lane.since ?? null, cwd: lane.cwd === null ? null : directoryOf(lane.cwd),
        })));
        return { kind: 'read', lanes };
    }
}
