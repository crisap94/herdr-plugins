import type { Unknown } from '@stateforge-labs/session-ledger';
import type { GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { Advance, FailedRun, LastRun, RecordedRun, Recap } from '@stateforge-labs/session-ledger';

export class PublishingRecords implements GuardedRecapRecords {
    private readonly inner: GuardedRecapRecords;
    private readonly published: (tab: ScopeId) => void;

    constructor(inner: GuardedRecapRecords, published: (tab: ScopeId) => void) {
        this.inner = inner;
        this.published = published;
    }

    readRecap(tab: ScopeId): Recap | null | Unknown {
        return this.inner.readRecap(tab);
    }

    lastRunOf(tab: ScopeId): LastRun | null | Unknown {
        return this.inner.lastRunOf(tab);
    }

    beginRun(tab: ScopeId, backend: Text | null, at: Instant): void {
        this.inner.beginRun(tab, backend, at);
        this.published(tab);
    }

    recordRun(run: RecordedRun): void {
        this.inner.recordRun(run);
        this.published(run.scope);
    }

    failRun(run: FailedRun): void {
        this.inner.failRun(run);
        this.published(run.scope);
    }

    advance(move: Advance): void {
        this.inner.advance(move);
    }
}
