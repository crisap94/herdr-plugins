import { must } from '#src/protocol/result.ts';
import type { LiveLanes, LiveLanesRead, TabViewRecord, TabViewStore } from '#src/ports/tab-views.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { parseTabId } from '#src/recap/domain/ids.ts';

export class PublishingViews implements TabViewStore, LiveLanes {
    private readonly inner: TabViewStore & LiveLanes;
    private readonly published: (tab: TabId) => void;

    constructor(inner: TabViewStore & LiveLanes, published: (tab: TabId) => void) {
        this.inner = inner;
        this.published = published;
    }

    readTab(tab: TabId): TabViewRecord | null {
        return this.inner.readTab(tab);
    }

    tabOf(pane: PaneId): TabId | null {
        const found = this.inner.tabOf(pane);
        return found === null ? null : must(parseTabId(found));
    }

    liveLanes(): LiveLanesRead {
        return this.inner.liveLanes();
    }

    writeTab(view: TabViewRecord): void {
        this.inner.writeTab(view);
        this.published(must(parseTabId(view.tab)));
    }
}
