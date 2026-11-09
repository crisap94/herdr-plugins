import type { BackendId } from '#src/recap/domain/backend.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Advance, FailedRun, LastRun, RecapRecords, RecordedRun, TabRecap } from '#src/ports/recap-records.ts';
import { tabId } from '#src/recap/domain/ids.ts';

export class PublishingRecords implements RecapRecords {
    private readonly inner: RecapRecords;
    private readonly published: (tab: TabId) => void;

    constructor(inner: RecapRecords, published: (tab: TabId) => void) {
        this.inner = inner;
        this.published = published;
    }

    readRecap(tab: TabId): TabRecap | null {
        return this.inner.readRecap(tab);
    }

    lastRunOf(tab: TabId): LastRun | null {
        return this.inner.lastRunOf(tab);
    }

    beginRun(tab: TabId, backend: BackendId | null, at: Instant): void {
        this.inner.beginRun(tab, backend, at);
        this.published(tab);
    }

    recordRun(run: RecordedRun): void {
        this.inner.recordRun(run);
        this.published(tabId(run.tab));
    }

    failRun(run: FailedRun): void {
        this.inner.failRun(run);
        this.published(tabId(run.tab));
    }

    advance(move: Advance): void {
        this.inner.advance(move);
    }
}
