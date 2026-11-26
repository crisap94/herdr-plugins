import assert from 'node:assert/strict';
import { scope } from '../ids.ts';
import type { Case } from '../run.ts';
import type { StoreUnderTest } from '../memory-store.ts';
import { advanceOf, brokenFact, cursor, factAt, failedOf, isUnknownValue, lastOf, recapOf, runOf, shapeOf, shapesOf, typeIdAt } from './record-fixtures.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { text, usd } from '../values.ts';
import { countOf } from '../../src/recap/domain/count.ts';
import { sessionKeyOf, scopeIdOf } from '../../src/recap/domain/followed-session-shape.ts';
import { textOf } from '../../src/recap/domain/text.ts';

export const REC_1: Case<null, StoreUnderTest> = {
    id: 'REC-1',
    group: 'REC',
    title: 'readRecap of an unknown scope',
    level: 'full',
    async run(_world, store) {
        assert.equal(store.records.readRecap(scope('nowhere')), null);
    },
};

export const REC_2: Case<null, StoreUnderTest> = {
    id: 'REC-2',
    group: 'REC',
    title: 'readRecap after recordRun',
    level: 'full',
    async run(_world, store) {
        const run = runOf({
            at: instant(500),
            cause: 'focused',
            backend: text('codex'),
            language: text('de'),
            costUsd: usd(0.25),
            sessions: [cursor('p1'), cursor('p2')],
            tasks: [shapeOf('a', [sessionKeyOf('p1')]), shapeOf('b', [sessionKeyOf('p2')])],
        });
        store.records.recordRun(run);
        const recap = recapOf(store, 'tab-1');
        assert.deepEqual(recap.sessions, run.sessions);
        assert.deepEqual(shapesOf(recap), run.tasks);
        assert.equal(recap.language, 'de');
        assert.equal(recap.backend, 'codex');
        assert.equal(recap.costUsd, 0.25);
        assert.equal(recap.at, 500);
        assert.equal(recap.running, false);
    },
};

export const REC_3: Case<null, StoreUnderTest> = {
    id: 'REC-3',
    group: 'REC',
    title: 'beginRun',
    level: 'full',
    async run(_world, store) {
        store.records.beginRun(scope('tab-1'), text('codex'), instant(400));
        const recap = recapOf(store, 'tab-1');
        assert.equal(recap.running, true);
        assert.equal(recap.backend, 'codex');
    },
};

export const REC_4: Case<null, StoreUnderTest> = {
    id: 'REC-4',
    group: 'REC',
    title: 'failRun',
    level: 'full',
    async run(_world, store) {
        store.records.recordRun(runOf({ language: text('de') }));
        store.records.beginRun(scope('tab-1'), text('codex'), instant(150));
        const failed = failedOf({ sessions: [cursor('p9')] });
        store.records.failRun(failed);
        const recap = recapOf(store, 'tab-1');
        assert.equal(recap.running, false);
        assert.equal(recap.error, failed.error);
        assert.equal(recap.language, 'de');
        assert.deepEqual(recap.sessions, failed.sessions);
    },
};

export const REC_5: Case<null, StoreUnderTest> = {
    id: 'REC-5',
    group: 'REC',
    title: 'advance',
    level: 'full',
    async run(_world, store) {
        const run = runOf({ language: text('de') });
        store.records.recordRun(run);
        const move = advanceOf({ sessions: [cursor('p3')] });
        store.records.advance(move);
        const recap = recapOf(store, 'tab-1');
        assert.deepEqual(recap.sessions, move.sessions);
        assert.equal(recap.error, move.error);
        assert.equal(recap.running, false);
        assert.deepEqual(shapesOf(recap), run.tasks);
        assert.equal(recap.language, 'de');
    },
};

export const REC_6: Case<null, StoreUnderTest> = {
    id: 'REC-6',
    group: 'REC',
    title: 'recordRun that throws half way leaves nothing of the run visible',
    level: 'full',
    async run(_world, store) {
        store.records.recordRun(runOf({ at: instant(100), cause: 'focused', language: text('de'), changed: [factAt(typeIdAt(1), { text: textOf('kept') })] }));
        const recap = store.records.readRecap(scope('tab-1'));
        const last = store.records.lastRunOf(scope('tab-1'));
        const factsA = store.facts.allOf({ scope: scopeIdOf('tab-1'), key: textOf('a') });
        const factsB = store.facts.allOf({ scope: scopeIdOf('tab-1'), key: textOf('b') });
        const broken = runOf({
            at: instant(900),
            cause: 'requested',
            language: text('fr'),
            backend: text('codex'),
            sessions: [cursor('p7'), cursor('p8')],
            tasks: [shapeOf('a', [sessionKeyOf('p7')]), shapeOf('b', [sessionKeyOf('p8')])],
            marks: [{ key: sessionKeyOf('p7'), at: instant(900), cursor: countOf(3) }],
            changed: [factAt(typeIdAt(2), { text: textOf('first half') }), brokenFact()],
        });
        assert.throws(() => {
            store.records.recordRun(broken);
        }, /a broken fact/);
        assert.deepEqual(store.records.readRecap(scope('tab-1')), recap);
        assert.deepEqual(store.records.lastRunOf(scope('tab-1')), last);
        assert.deepEqual(store.facts.allOf({ scope: scopeIdOf('tab-1'), key: textOf('a') }), factsA);
        assert.deepEqual(store.facts.allOf({ scope: scopeIdOf('tab-1'), key: textOf('b') }), factsB);
    },
};

export const REC_7: Case<null, StoreUnderTest> = {
    id: 'REC-7',
    group: 'REC',
    title: 'lastRunOf after a written run, then a failed run',
    level: 'full',
    async run(_world, store) {
        store.records.recordRun(runOf({ at: instant(100), cause: 'focused' }));
        store.records.failRun(failedOf({ at: instant(200), cause: 'turn-ended' }));
        assert.deepEqual(lastOf(store, 'tab-1'), { at: 100, cause: 'focused' });
    },
};

export const REC_8: Case<null, StoreUnderTest> = {
    id: 'REC-8',
    group: 'REC',
    title: 'lastRunOf of an unknown scope',
    level: 'full',
    async run(_world, store) {
        assert.equal(lastOf(store, 'nowhere'), null);
    },
};

export const REC_9: Case<null, StoreUnderTest> = {
    id: 'REC-9',
    group: 'REC',
    title: 'two cursors with the same key and different sources',
    level: 'full',
    async run(_world, store) {
        const lanes = [cursor('p1', '/transcripts/one.jsonl'), cursor('p1', '/transcripts/two.jsonl')];
        store.records.recordRun(runOf({ sessions: lanes }));
        assert.deepEqual(recapOf(store, 'tab-1').sessions, lanes);
    },
};

export const REC_10: Case<null, StoreUnderTest> = {
    id: 'REC-10',
    group: 'REC',
    title: 'a failed read on readRecap or lastRunOf is Unknown, never null',
    level: 'full',
    async run(_world, store) {
        store.failReads?.('readRecap', 1);
        assert.equal(isUnknownValue(store.records.readRecap(scope('nowhere'))), true);
        store.failReads?.('lastRunOf', 1);
        assert.equal(isUnknownValue(store.records.lastRunOf(scope('nowhere'))), true);
    },
};

export const REC_11: Case<null, StoreUnderTest> = {
    id: 'REC-11',
    group: 'REC',
    title: 'writes for scope A leave scope B unchanged',
    level: 'full',
    async run(_world, store) {
        const before = store.records.readRecap(scope('tab-2'));
        store.records.recordRun(runOf({ scope: scopeIdOf('tab-1') }));
        store.records.beginRun(scope('tab-1'), text('codex'), instant(150));
        store.records.failRun(failedOf({ scope: scopeIdOf('tab-1') }));
        store.records.advance(advanceOf({ scope: scopeIdOf('tab-1') }));
        assert.deepEqual(store.records.readRecap(scope('tab-2')), before);
    },
};

export const REC_12: Case<null, StoreUnderTest> = {
    id: 'REC-12',
    group: 'REC',
    title: 'recordRun with cause imported',
    level: 'full',
    async run(_world, store) {
        store.records.recordRun(runOf({ cause: 'imported' }));
        assert.equal(lastOf(store, 'tab-1')?.cause, 'imported');
    },
};

export const REC_13: Case<null, StoreUnderTest> = {
    id: 'REC-13',
    group: 'REC',
    title: 'recordRun with marks',
    level: 'full',
    async run(_world, store) {
        store.records.recordRun(runOf({ at: instant(100), marks: [{ key: sessionKeyOf('p1'), at: instant(90), cursor: countOf(3) }] }));
        const stored = store.marksOf(scope('tab-1'));
        assert.deepEqual(stored, [{ at: 90 }]);
        store.records.recordRun(runOf({ at: instant(200) }));
        assert.deepEqual(store.marksOf(scope('tab-1')), stored);
    },
};

export const RECORD_CASES: readonly Case<null, StoreUnderTest>[] = [
    REC_1,
    REC_2,
    REC_3,
    REC_4,
    REC_5,
    REC_6,
    REC_7,
    REC_8,
    REC_9,
    REC_10,
    REC_11,
    REC_12,
    REC_13,
];
