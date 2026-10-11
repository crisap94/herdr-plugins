import type { LiveLanes, LiveLanesRead, TabView, TabViews } from '#src/ports/tab-views.ts';
import type { RestoredLane } from '#src/recap/domain/closures.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';

export class MemoryTabViews implements Pick<TabViews, 'writeTab' | 'tabOf'>, LiveLanes {
    private readonly tabs = new Map<string, TabView>();

    writeTab(view: TabView): void {
        this.tabs.set(view.tab, view);
    }

    tabOf(pane: string): string | null {
        return [...this.tabs.values()].find((view) => view.lanes.some((lane) => lane.pane === pane))?.tab ?? null;
    }

    liveLanes(): LiveLanesRead {
        const lanes: RestoredLane[] = [...this.tabs.keys()].toSorted().flatMap((tab) => (this.tabs.get(tab)?.lanes ?? []).map((lane) => ({
            tab: tabId(tab), pane: paneId(lane.pane), agent: agentKind(lane.agent), since: lane.since ?? null, cwd: lane.cwd,
        })));
        return { kind: 'read', lanes };
    }
}
