import type { Unknown } from '#src/ports/unknowable.ts';
import type { GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Advance, FailedRun, LastRun, RecordedRun, TabRecap } from '#src/ports/recap-records.ts';

export class PublishingRecords implements GuardedRecapRecords {
    private readonly inner: GuardedRecapRecords;
    private readonly published: (tab: TabId) => void;

    constructor(inner: GuardedRecapRecords, published: (tab: TabId) => void) {
        this.inner = inner;
        this.published = published;
    }

    readRecap(tab: TabId): TabRecap | null | Unknown {
        return this.inner.readRecap(tab);
    }

    lastRunOf(tab: TabId): LastRun | null | Unknown {
        return this.inner.lastRunOf(tab);
    }

    beginRun(tab: TabId, backend: Text | null, at: Instant): void {
        this.inner.beginRun(tab, backend, at);
        this.published(tab);
    }

    recordRun(run: RecordedRun): void {
        this.inner.recordRun(run);
        this.published(run.tab);
    }

    failRun(run: FailedRun): void {
        this.inner.failRun(run);
        this.published(run.tab);
    }

    advance(move: Advance): void {
        this.inner.advance(move);
    }
}
