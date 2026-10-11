import type { TabView, TabViews } from '#src/ports/tab-views.ts';

export class MemoryTabViews implements Pick<TabViews, 'writeTab' | 'tabOf'> {
    private readonly tabs = new Map<string, TabView>();

    writeTab(view: TabView): void {
        this.tabs.set(view.tab, view);
    }

    tabOf(pane: string): string | null {
        return [...this.tabs.values()].find((view) => view.lanes.some((lane) => lane.pane === pane))?.tab ?? null;
    }
}
