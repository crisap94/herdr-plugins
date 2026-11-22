import type { Database } from 'bun:sqlite';
import { must } from '#src/protocol/result.ts';
import { parsePaneId, parseTabId } from '#src/recap/domain/ids.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { LiveLanes, LiveLanesRead, TabView, TabViews } from '#src/ports/tab-views.ts';
import { parseTabViewRecord } from '#src/ports/tab-views.ts';
import { TabViewRowStore } from '../tab-views.ts';

export class TabViewsRepository implements TabViews, LiveLanes {
    private readonly store: TabViewRowStore;

    constructor(db: Database, daemonVersion: string | null = null) {
        const version = daemonVersion === null ? null : parseText(daemonVersion);
        this.store = new TabViewRowStore(db, version?.kind === 'ok' ? version.value : null);
    }

    tabOf(pane: string): string | null {
        const id = parsePaneId(pane);
        return id.kind === 'ok' ? this.store.tabOf(id.value) : null;
    }

    readTab(tab: string): TabView | null {
        const id = parseTabId(tab);
        return id.kind === 'ok' ? this.store.readTab(id.value) : null;
    }

    liveLanes(): LiveLanesRead {
        return this.store.liveLanes();
    }

    writeTab(view: TabView): void {
        this.store.writeTab(must(parseTabViewRecord(view)));
    }
}
