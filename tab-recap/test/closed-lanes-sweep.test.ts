import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetClosedTabs } from '#src/recap/application/retention.ts';
import type { SweepDeps } from '#src/recap/application/retention.ts';
import type { ClosureSweep } from '#src/ports/closed-lanes.ts';
import type { RemovedCounts, RetentionPort } from '#src/ports/retention.ts';
import { tabId } from '#test/support/ids.ts';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { countOf, type Count } from '@stateforge-labs/session-ledger';
import { countFrom } from './fakes/closed-values.ts';
import type { Instant } from '@stateforge-labs/session-ledger';

const DAY = 86_400_000;
const NOW = instant(100 * DAY);

const taken: RemovedCounts = { runs: countFrom(1), chapters: countFrom(1), boundaries: countFrom(0), compactions: countFrom(0), facts: countFrom(0) };

function fakeRetention(old: readonly ScopeId[], failing: readonly ScopeId[] = []): { readonly retention: RetentionPort; readonly removed: string[] } {
    const removed: string[] = [];
    return {
        removed,
        retention: {
            expired: (_cutoff: Instant, protectedTabs: readonly ScopeId[]): readonly ScopeId[] => old.filter((tab) => !protectedTabs.includes(tab)),
            remove: (tab: ScopeId): RemovedCounts => {
                if (failing.some((id) => id === tab)) {
                    throw new Error('locked');
                }
                removed.push(tab);
                return taken;
            },
        },
    };
}

function fakeClosures(options: { readonly protectedNow?: readonly ScopeId[]; readonly expired?: readonly ScopeId[]; readonly counts?: Readonly<Record<string, number>> }): { readonly closures: ClosureSweep; readonly pruned: string[] } {
    const pruned: string[] = [];
    return {
        pruned,
        closures: {
            protectedTabs: (_now: Instant): readonly ScopeId[] => options.protectedNow ?? [],
            expiredTabs: (_now: Instant): readonly ScopeId[] => options.expired ?? [],
            countOf: (tab: ScopeId): Count => countFrom(options.counts?.[tab] ?? 0),
            pruneTab: (tab: ScopeId, _now: Instant): Count => { pruned.push(tab); return countFrom(1); },
        },
    };
}

function deps(retention: RetentionPort, closures: ClosureSweep, days: number, lines: string[]): SweepDeps {
    return { retention, closures, clock: { now: (): Instant => NOW }, days: () => countOf(days), log: (line) => { lines.push(line); } };
}

test('KEEP_DAYS=0 removes no tab but still prunes expired closures', () => {
    const { retention, removed } = fakeRetention([tabId('w1:old')]);
    const { closures, pruned } = fakeClosures({ expired: [tabId('w1:old')] });
    forgetClosedTabs(deps(retention, closures, 0, []));
    assert.deepEqual(removed, []);
    assert.deepEqual(pruned, ['w1:old']);
});
