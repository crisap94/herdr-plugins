import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetClosedTabs } from '#src/recap/application/retention.ts';
import type { SweepDeps } from '#src/recap/application/retention.ts';
import type { ClosureSweep } from '#src/ports/closed-lanes.ts';
import type { Removed, Retention } from '#src/ports/retention.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';

const DAY = 86_400_000;
const NOW = instant(100 * DAY);

const taken: Removed = { runs: 1, chapters: 1, boundaries: 0, compactions: 0, facts: 0 };

function fakeRetention(old: readonly TabId[], failing: readonly TabId[] = []): { readonly retention: Retention; readonly removed: string[] } {
    const removed: string[] = [];
    return {
        removed,
        retention: {
            expired: (_cutoff: number, protectedTabs: readonly TabId[]): readonly TabId[] => old.filter((tab) => !protectedTabs.includes(tab)),
            remove: (tab: string): Removed => {
                if (failing.some((id) => id === tab)) {
                    throw new Error('locked');
                }
                removed.push(tab);
                return taken;
            },
        },
    };
}

function fakeClosures(options: { readonly protectedNow?: readonly TabId[]; readonly expired?: readonly TabId[]; readonly counts?: Readonly<Record<string, number>> }): { readonly closures: ClosureSweep; readonly pruned: string[] } {
    const pruned: string[] = [];
    return {
        pruned,
        closures: {
            protectedTabs: (_now: Instant): readonly TabId[] => options.protectedNow ?? [],
            expiredTabs: (_now: Instant): readonly TabId[] => options.expired ?? [],
            countOf: (tab: TabId): number => options.counts?.[tab] ?? 0,
            pruneTab: (tab: TabId, _now: Instant): number => { pruned.push(tab); return 1; },
        },
    };
}

function deps(retention: Retention, closures: ClosureSweep, days: number, lines: string[]): SweepDeps {
    return { retention, closures, clock: { now: (): Instant => NOW }, days: () => days, log: (line) => { lines.push(line); } };
}

test('KEEP_DAYS=0 removes no tab but still prunes expired closures', () => {
    const { retention, removed } = fakeRetention([tabId('w1:old')]);
    const { closures, pruned } = fakeClosures({ expired: [tabId('w1:old')] });
    forgetClosedTabs(deps(retention, closures, 0, []));
    assert.deepEqual(removed, []);
    assert.deepEqual(pruned, ['w1:old']);
});

test('a failing tab does not stop the others', () => {
    const lines: string[] = [];
    const { retention, removed } = fakeRetention([tabId('w1:a'), tabId('w1:b'), tabId('w1:c')], [tabId('w1:b')]);
    forgetClosedTabs(deps(retention, fakeClosures({}).closures, 30, lines));
    assert.deepEqual(removed, ['w1:a', 'w1:c']);
    assert.match(lines.join('\n'), /could not remove w1:b: locked/);
});

test('the removal line logs the closure count of the tab', () => {
    const lines: string[] = [];
    const { retention } = fakeRetention([tabId('w1:a')]);
    forgetClosedTabs(deps(retention, fakeClosures({ counts: { 'w1:a': 3 } }).closures, 30, lines));
    assert.deepEqual(lines, ['retention: removed w1:a (1 runs, 0 facts, 1 chapters, 0 boundaries, 0 compactions, 3 closures)']);
});

test('a tab kept by a restart closure in the window is not removed, however old its last run', () => {
    const { retention, removed } = fakeRetention([tabId('w1:restart')]);
    const { closures } = fakeClosures({ protectedNow: [tabId('w1:restart')] });
    forgetClosedTabs(deps(retention, closures, 30, []));
    assert.deepEqual(removed, []);
});

test('a tab with no protecting closure is offered for removal', () => {
    const { retention, removed } = fakeRetention([tabId('w1:gone')]);
    const { closures } = fakeClosures({ protectedNow: [] });
    forgetClosedTabs(deps(retention, closures, 30, []));
    assert.deepEqual(removed, ['w1:gone']);
});
