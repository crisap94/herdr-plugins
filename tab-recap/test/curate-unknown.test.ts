import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CurateTasks } from '#src/recap/application/curate.ts';
import type { CurateDeps } from '#src/recap/application/curate.ts';
import type { GuardedLedger, GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { TabRecap } from '#src/ports/recap-records.ts';
import { unknown, type Unknown } from '#src/ports/unknowable.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { causeOf } from './fakes/cause.ts';
import { MemoryLedger } from '#test/fakes/memory-ledger.ts';
import { MemoryStories } from '#test/fakes/memory-stories.ts';
import { brand } from '#src/recap/domain/brand.ts';

const [textOf, instantOf] = [brand<string, 'Text'>, brand<number, 'Instant'>];

const TAB = tabId('w1:t1');
const LOCKED = unknown({ why: 'unreadable', detail: causeOf('locked') });
const ONE_TASK: TabRecap = { ...blankRecap('w1:t1'), tasks: [{ id: 't1', name: 't1', lanes: [], sections: null, markdown: '' }] };

interface Seen { allOf: number; storyReads: number; writers: number }

function curatorOf(recap: TabRecap | Unknown, facts: 'known' | 'unknown', seen: Seen): CurateTasks {
    const memory = new MemoryLedger();
    const stories = new MemoryStories(memory);
    const records: GuardedRecapRecords = {
        readRecap: () => recap,
        lastRunOf: () => null,
        beginRun: () => undefined,
        recordRun: () => undefined,
        failRun: () => undefined,
        advance: () => undefined,
    };
    const ledger: GuardedLedger = {
        openOf: () => [],
        recentlyClosed: () => [],
        allOf: () => { seen.allOf += 1; return facts === 'known' ? [] : LOCKED; },
        keysOf: () => [],
        historyOf: () => [],
    };
    const deps: CurateDeps = {
        records,
        ledger,
        stories: { read: (tab, task) => { seen.storyReads += 1; return stories.read(tab, task); }, keep: (run, change) => stories.keep(run, change) },
        writer: () => { seen.writers += 1; return null; },
        clock: () => instantOf(0),
        zone: () => textOf('UTC'),
        language: () => textOf('en'),
        rubric: textOf(''),
        log: () => undefined,
    };
    return new CurateTasks(deps);
}

test('an unknown recap leaves curation untouched', async () => {
    const seen: Seen = { allOf: 0, storyReads: 0, writers: 0 };
    await curatorOf(LOCKED, 'known', seen).run(TAB);
    assert.deepEqual(seen, { allOf: 0, storyReads: 0, writers: 0 });
});

test('unknown task facts stop curation before the story is read', async () => {
    const known: Seen = { allOf: 0, storyReads: 0, writers: 0 };
    await curatorOf(ONE_TASK, 'known', known).run(TAB);
    const failed: Seen = { allOf: 0, storyReads: 0, writers: 0 };
    await curatorOf(ONE_TASK, 'unknown', failed).run(TAB);
    assert.deepEqual([known.storyReads, failed.storyReads], [1, 0]);
});
