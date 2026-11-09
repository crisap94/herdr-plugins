import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { must } from '#src/protocol/result.ts';
import { NO, YES, type Flag } from '#src/recap/domain/gui-tab-parts.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { LEASE_CAP, LEASE_MS } from './desktop-constants.ts';

export class OpenLeases {
    private readonly now: () => Instant;
    private readonly until = new Map<TabId, Instant>();

    constructor(now: () => Instant) {
        this.now = now;
    }

    renew(tab: TabId): Flag {
        const at = this.now();
        this.sweep(at);
        if (!this.until.has(tab) && this.until.size >= LEASE_CAP) { return NO; }
        this.until.set(tab, instant(at + LEASE_MS));
        return YES;
    }

    drop(tab: TabId): void {
        this.until.delete(tab);
    }

    size(): Count {
        return must(parseCount(this.until.size));
    }

    held(tab: TabId, at: Instant): Flag {
        const end = this.until.get(tab);
        if (end === undefined) { return NO; }
        if (at < end) { return YES; }
        this.until.delete(tab);
        return NO;
    }

    private sweep(at: Instant): void {
        for (const [tab, end] of this.until) {
            if (at >= end) { this.until.delete(tab); }
        }
    }
}
