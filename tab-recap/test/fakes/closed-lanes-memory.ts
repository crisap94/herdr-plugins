import type { ClosedLaneList, ClosedLaneRead, ClosedLaneRecord, ClosureReader, ClosureRecorder, ClosureSweep } from '#src/ports/closed-lanes.ts';
import type { ClosedLane, ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { Count } from '#src/recap/domain/count.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { closedCutoffOf } from '#src/recap/domain/retention.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';
import type { Instant } from '#src/recap/domain/time.ts';

const sameKey = (record: ClosedLaneRecord, closed: ClosedLane): boolean =>
    record.tab === closed.tab && record.pane === closed.pane && record.closedAt === closed.closedAt;

export class MemoryClosedLanes implements ClosureRecorder, ClosureReader, ClosureSweep {
    private readonly days: ClosedLaneDays;
    private readonly records: ClosedLaneRecord[] = [];

    constructor(days: ClosedLaneDays) {
        this.days = days;
    }

    record(closed: ClosedLane): void {
        if (this.records.some((record) => sameKey(record, closed))) {
            return;
        }
        this.records.push({ tab: closed.tab, pane: closed.pane, agent: closed.agent, closedAt: closed.closedAt, cwd: closed.cwd, association: null });
    }

    resolve(identity: ClosedLaneIdentity): ClosedLaneRead {
        const record = this.records.find((row) => row.tab === identity.tab && row.pane === identity.pane && row.closedAt === identity.closedAt);
        return record === undefined ? { kind: 'absent' } : { kind: 'row', record };
    }

    listOf(tab: TabId, now: Instant): ClosedLaneList {
        const cutoff = closedCutoffOf(now, this.days);
        const records = this.records
            .filter((row) => row.tab === tab && cutoff !== null && row.closedAt >= cutoff)
            .toSorted((a, b) => b.closedAt - a.closedAt || Number(a.pane > b.pane) - Number(a.pane < b.pane));
        return { kind: 'listed', records };
    }

    protectedTabs(now: Instant): readonly TabId[] {
        const cutoff = closedCutoffOf(now, this.days);
        return [...new Set(this.records.filter((row) => cutoff !== null && row.closedAt >= cutoff).map((row) => row.tab))].toSorted();
    }

    expiredTabs(now: Instant): readonly TabId[] {
        const cutoff = closedCutoffOf(now, this.days);
        return [...new Set(this.records.filter((row) => cutoff === null || row.closedAt < cutoff).map((row) => row.tab))].toSorted();
    }

    countOf(tab: TabId): Count {
        return must(parseCount(this.records.filter((row) => row.tab === tab).length));
    }

    pruneTab(tab: TabId, now: Instant): Count {
        const cutoff = closedCutoffOf(now, this.days);
        const expired = (row: ClosedLaneRecord): boolean => row.tab === tab && (cutoff === null || row.closedAt < cutoff);
        const kept = this.records.filter((row) => !expired(row));
        const removed = this.records.length - kept.length;
        this.records.splice(0, this.records.length, ...kept);
        return must(parseCount(removed));
    }
}
