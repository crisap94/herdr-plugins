import { readFileSync } from 'node:fs';
import * as sl from '@stateforge-labs/session-ledger';
import { createEngineWorld, createMemoryStore, type EngineWorld, type StoreUnderTest, type Subject } from '@stateforge-labs/session-ledger/testkit';
import { pluginEngine } from '#src/engine/engine-adapter.ts';
import { legacyPlugsOf } from '@stateforge-labs/session-ledger/unstable/facade/plugs.ts';
import { historyOf } from '@stateforge-labs/session-ledger/unstable/facade/translate.ts';
import type { GuardedLedger, GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import { isUnknownRead } from '#src/ports/guarded-reads.ts';
import type { Unknowable, Unknown } from '#src/ports/unknowable.ts';
import type { RecordedRun } from '#src/ports/recap-records.ts';
import type { Fact, FactId } from '#src/recap/domain/fact.ts';
import type { Operation, Refusal } from '#src/recap/domain/ops.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { memoryStore } from '#test/db/support.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';

const isLedgerFactId = (id: FactId): id is FactId & sl.FactId => id !== '';
const isPluginFactId = (id: sl.FactId): id is sl.FactId & FactId => id !== '';
const isPluginText = (text: sl.Text): text is sl.Text & Text => text.length >= 0;
const isLedgerText = (text: string): text is sl.Text => text.length >= 0;
const isLedgerExitCode = (code: number): code is sl.ExitCode => Number.isSafeInteger(code);

const bridged = <F, T extends F>(value: F, fits: (value: F) => value is T, what: string): T => {
    if (fits(value)) {
        return value;
    }
    throw new Error(`conformance subject: ${what} does not cross the boundary`);
};

const ledgerFactId = (id: FactId): sl.FactId => bridged(id, isLedgerFactId, 'a fact id');
const pluginFactId = (id: sl.FactId): FactId => bridged(id, isPluginFactId, 'a fact id');

const ledgerUnknowable = (why: Unknowable): sl.Unknowable => {
    if (why.why === 'not-found') {
        return { why: 'not-found', what: bridged(why.what, isLedgerText, 'a missing thing') };
    }
    return why.why === 'failed' ? { why: 'failed', code: bridged(why.code, isLedgerExitCode, 'an exit code'), detail: why.detail } : why;
};

const ledgerUnknown = (unknown: Unknown): sl.Unknown => ({ kind: 'unknown', why: ledgerUnknowable(unknown.why) });

const ledgerRead = <T>(read: T | Unknown): T | sl.Unknown => (isUnknownRead(read) ? ledgerUnknown(read) : read);

const ledgerFact = (fact: Fact): sl.Fact => ({ ...fact, id: ledgerFactId(fact.id) });
const pluginFact = (fact: sl.Fact): Fact => ({ ...fact, id: pluginFactId(fact.id) });

const pluginOperation = (op: sl.Operation): Operation => {
    if (op.op !== 'close' || op.anchor === undefined) {
        return op.op === 'close' ? { op: 'close', id: op.id, why: op.why } : op;
    }
    return { ...op, anchor: bridged(op.anchor, isPluginText, 'an anchor') };
};

const pluginRefusal = (refusal: sl.Refusal): Refusal => ({ op: pluginOperation(refusal.op), reason: refusal.reason });

const pluginRecorded = (run: sl.RecordedRun): RecordedRun => ({ ...run, changed: run.changed.map(pluginFact), refused: run.refused.map(pluginRefusal) });

const ledgerRecords = (records: GuardedRecapRecords): sl.Records => ({
    readRecap: (scope) => ledgerRead(records.readRecap(tabId(scope))),
    lastRunOf: (scope) => ledgerRead(records.lastRunOf(tabId(scope))),
    beginRun: (scope, backend, at) => {
        records.beginRun(tabId(scope), backend, at);
    },
    recordRun: (run) => {
        records.recordRun(pluginRecorded(run));
    },
    failRun: (run) => {
        records.failRun(run);
    },
    advance: (move) => {
        records.advance(move);
    },
});

const ledgerFactsOf = (read: readonly Fact[] | Unknown): readonly sl.Fact[] | sl.Unknown => (isUnknownRead(read) ? ledgerUnknown(read) : read.map(ledgerFact));

const ledgerFacts = (ledger: GuardedLedger): sl.FactStore => ({
    openOf: (task) => ledgerFactsOf(ledger.openOf(task)),
    recentlyClosed: (task, sinceMs) => ledgerFactsOf(ledger.recentlyClosed(task, sinceMs)),
    allOf: (task) => ledgerFactsOf(ledger.allOf(task)),
    keysOf: (scope) => ledgerRead(ledger.keysOf(tabId(scope))),
    historyOf: (scope, key) => historyOf(ledger.historyOf(tabId(scope), paneId(key))),
});

export const pluginSubject: Subject<EngineWorld, sl.Engine> = {
    name: 'plugin engine',
    level: 'full',
    world: () => createEngineWorld(),
    create: (world) => pluginEngine(legacyPlugsOf(world.plugs)),
};

export const memoryStoreSubject: Subject<null, StoreUnderTest> = {
    name: 'memory store',
    level: 'full',
    world: () => null,
    create: () => createMemoryStore(),
};

export const sqliteStoreSubject: Subject<null, StoreUnderTest> = {
    name: 'sqlite store on memory',
    level: 'full',
    world: () => null,
    create: () => {
        const store = memoryStore();
        return {
            records: ledgerRecords(store.records),
            facts: ledgerFacts(store.ledger),
            failReads: () => {
                store.db.close();
            },
            marksOf: (scope) => store.boundaries.breaksOf(scope).filter((each) => each.kind === 'compacted').map((each) => ({ at: instant(each.at) })),
        };
    },
};

export const ENGINE_GROUPS: readonly string[] = ['FOL', 'TRN', 'STA', 'FBY', 'EVT', 'CMP', 'CUR', 'HIS', 'REF', 'RUN', 'CSR', 'LNG', 'RDF', 'PRT', 'LED'];

export const STORE_GROUPS: readonly string[] = ['REC', 'FCT'];

const idsOf = (group: string, parsed: unknown): readonly string[] => {
    if (!Array.isArray(parsed)) {
        throw new Error(`pending-${group}.json is not an array`);
    }
    return parsed.map((id: unknown) => {
        if (typeof id !== 'string') {
            throw new Error(`pending-${group}.json holds an id that is not a string`);
        }
        return id;
    });
};

export const pendingOf = (groups: readonly string[]): readonly string[] =>
    groups.flatMap((group) => idsOf(group, JSON.parse(readFileSync(new URL(`./pending-${group}.json`, import.meta.url), 'utf8'))));
