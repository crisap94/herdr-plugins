import type { LiveLanes, LiveLanesRead, TabView, TabViews } from '#src/ports/tab-views.ts';
import { tabId, type TabId } from '#src/recap/domain/ids.ts';

export class PublishingViews implements TabViews, LiveLanes {
    private readonly inner: TabViews & LiveLanes;
    private readonly published: (tab: TabId) => void;

    constructor(inner: TabViews & LiveLanes, published: (tab: TabId) => void) {
        this.inner = inner;
        this.published = published;
    }

    readTab(tab: string): TabView | null {
        return this.inner.readTab(tab);
    }

    tabOf(pane: string): string | null {
        return this.inner.tabOf(pane);
    }

    liveLanes(): LiveLanesRead {
        return this.inner.liveLanes();
    }

    writeTab(view: TabView): void {
        this.inner.writeTab(view);
        this.published(tabId(view.tab));
    }
}
