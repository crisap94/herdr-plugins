import { must } from '@stateforge-labs/session-ledger';
import type { LiveLanes, LiveLanesRead, TabViewRecord, TabViewStore } from '#src/ports/tab-views.ts';
import type { SessionKey, ScopeId } from '#src/recap/domain/ids.ts';
import { parseTabId } from '#src/recap/domain/ids.ts';

export class PublishingViews implements TabViewStore, LiveLanes {
    private readonly inner: TabViewStore & LiveLanes;
    private readonly published: (tab: ScopeId) => void;

    constructor(inner: TabViewStore & LiveLanes, published: (tab: ScopeId) => void) {
        this.inner = inner;
        this.published = published;
    }

    readTab(tab: ScopeId): TabViewRecord | null {
        return this.inner.readTab(tab);
    }

    tabOf(pane: SessionKey): ScopeId | null {
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
