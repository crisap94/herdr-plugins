import { readFileSync } from 'node:fs';
import * as sl from '@stateforge-labs/session-ledger';
import { createEngineWorld, createMemoryStore, type EngineWorld, type StoreUnderTest, type Subject } from '@stateforge-labs/session-ledger/testkit';
import { pluginEngine } from '#src/engine/engine-adapter.ts';
import { contractFold, legacyPlugsOf } from '@stateforge-labs/session-ledger/unstable/facade/plugs.ts';
import type { Ledger, Applied } from '#src/ports/ledger.ts';
import type { RecapRecords, RecordedRun } from '#src/ports/recap-records.ts';
import type { Fact, FactId, RunId } from '#src/recap/domain/fact.ts';
import type { Operation, Refusal, RunRef, TaskOps } from '#src/recap/domain/ops.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { memoryStore } from '#test/db/support.ts';

const isLedgerFactId = (id: FactId): id is FactId & sl.FactId => id !== '';
const isPluginFactId = (id: sl.FactId): id is sl.FactId & FactId => id !== '';
const isPluginRunId = (id: sl.RunId): id is sl.RunId & RunId => id !== '';
const isLedgerText = (text: Text): text is Text & sl.Text => text.length >= 0;
const isPluginText = (text: sl.Text): text is sl.Text & Text => text.length >= 0;

const bridged = <F, T extends F>(value: F, fits: (value: F) => value is T, what: string): T => {
    if (fits(value)) {
        return value;
    }
    throw new Error(`conformance subject: ${what} does not cross the boundary`);
};

const ledgerFactId = (id: FactId): sl.FactId => bridged(id, isLedgerFactId, 'a fact id');
const pluginFactId = (id: sl.FactId): FactId => bridged(id, isPluginFactId, 'a fact id');

const ledgerFact = (fact: Fact): sl.Fact => ({ ...fact, id: ledgerFactId(fact.id) });
const pluginFact = (fact: sl.Fact): Fact => ({ ...fact, id: pluginFactId(fact.id) });

const ledgerOperation = (op: Operation): sl.Operation => {
    if (op.op !== 'close' || op.anchor === undefined) {
        return op.op === 'close' ? { op: 'close', id: op.id, why: op.why } : op;
    }
    return { ...op, anchor: bridged(op.anchor, isLedgerText, 'an anchor') };
};
const pluginOperation = (op: sl.Operation): Operation => {
    if (op.op !== 'close' || op.anchor === undefined) {
        return op.op === 'close' ? { op: 'close', id: op.id, why: op.why } : op;
    }
    return { ...op, anchor: bridged(op.anchor, isPluginText, 'an anchor') };
};

const ledgerRefusal = (refusal: Refusal): sl.Refusal => ({ op: ledgerOperation(refusal.op), reason: refusal.reason });
const pluginRefusal = (refusal: sl.Refusal): Refusal => ({ op: pluginOperation(refusal.op), reason: refusal.reason });

const pluginTaskOps = (task: sl.TaskOps): TaskOps => ({ task: task.task, ops: task.ops.map(pluginOperation) });

const pluginRun = (run: sl.RunRef): RunRef => ({
    id: bridged(run.id, isPluginRunId, 'a run id'),
    task: run.task,
    at: run.at,
    language: run.language,
    mint: () => pluginFactId(run.mint()),
});

const ledgerApplied = (applied: Applied): sl.Applied => ({ changed: applied.changed.map(ledgerFact), refused: applied.refused.map(ledgerRefusal) });

const pluginRecorded = (run: sl.RecordedRun): RecordedRun => ({ ...run, ops: run.ops.map(pluginTaskOps) });

const ledgerRecords = (records: RecapRecords): sl.Records => ({
    readRecap: (scope) => records.readRecap(scope),
    lastRunOf: (scope) => records.lastRunOf(scope),
    beginRun: (scope, backend, at) => {
        records.beginRun(scope, backend, at);
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

const ledgerFacts = (ledger: Ledger): sl.FactStore => ({
    openOf: (task) => ledger.openOf(task).map(ledgerFact),
    recentlyClosed: (task, sinceMs) => ledger.recentlyClosed(task, sinceMs).map(ledgerFact),
    allOf: (task) => ledger.allOf(task).map(ledgerFact),
    keysOf: (scope) => ledger.keysOf(scope),
    historyOf: (scope, key) => ledger.historyOf(scope, key),
    apply: (run, ops) => ledgerApplied(ledger.apply(pluginRun(run), ops.map(pluginOperation))),
});

export const pluginSubject: Subject<EngineWorld, sl.Engine> = {
    name: 'plugin engine',
    level: 'full',
    world: () => createEngineWorld({ fold: contractFold }),
    create: (world) => pluginEngine(legacyPlugsOf(world.plugs)),
};

export const memoryStoreSubject: Subject<null, StoreUnderTest> = {
    name: 'memory store with the plugin fold',
    level: 'full',
    world: () => null,
    create: () => createMemoryStore({ fold: contractFold }),
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
            marksOf: (scope) => store.boundaries.breaksOf(scope).filter((each) => each.kind === 'compacted').map((each) => ({ at: each.at })),
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
