import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { ids } from '#src/adapters/db/uuid7.ts';
import { BUSY_PRAGMA, MEMORY } from '#src/adapters/db/connection.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { storeOver, type Store, type StoreSettings } from '#src/adapters/db/database.ts';
import { opsOfSections } from '#src/adapters/db/import/sections-to-ops.ts';
import type { SessionCursor, RecordedRun, Recap } from '@stateforge-labs/session-ledger';
import { mintFactId } from '#src/adapters/db/ledger-rows.ts';
import { checkedLedger, isUnknownRead } from '#src/ports/guarded-reads.ts';
import type { Unknown } from '@stateforge-labs/session-ledger';
import { foldedRun, throwingLedger } from '@stateforge-labs/session-ledger';
import type { TaskOps } from '@stateforge-labs/session-ledger';
import { agentKind, paneId } from '#test/support/ids.ts';
import { sourcePathOf, cursorOf } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';
import { brand } from '@stateforge-labs/session-ledger';
import { uncheckedTabId } from '#src/recap/domain/ids.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import type { RunId } from '#src/recap/domain/run-ids.ts';
import type { RunFilter, RunInputReader, RunRecord } from '#src/ports/run-inputs.ts';
import type { VerdictRecord } from '#src/ports/verdicts.ts';

export function openFixture(path: string = MEMORY): Database {
    const db = new Database(path);
    db.exec(BUSY_PRAGMA);
    db.exec('PRAGMA foreign_keys = ON');
    return db;
}

export function memoryStore(options: StoreSettings = {}): Store {
    const opened = openDatabase(fsPathOf(MEMORY));
    if (opened.kind !== 'ready') {
        throw new Error('a fresh in-memory database is never newer');
    }
    return storeOver(opened.db, options);
}

export const shapeOf = (db: Database): string[] => (db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { type: string; name: string; tbl_name: string; sql: string }[])
    .map((row) => `${row.type} ${row.name} ${row.tbl_name} ${row.sql.replaceAll(/\s+/g, ' ').replaceAll('"', '').replaceAll(/\s*\(\s*/g, '(').replaceAll(/\s*\)\s*/g, ')').replaceAll(/\s*,\s*/g, ',').trim()}`);

export function storeRead<T>(read: T | Unknown): T {
    if (isUnknownRead(read)) {
        throw new Error(`the store read failed: ${read.why.why}`);
    }
    return read;
}

export const scratchDir = (name: string): string => mkdtempSync(join(tmpdir(), `recap-${name}-`));

export type RunInput = Omit<RecordedRun, 'changed' | 'refused'> & { readonly ops?: readonly TaskOps[] };

export function recordOps(store: Pick<Store, 'records' | 'ledger'>, run: RunInput): void {
    const { ops = [], ...rest } = run;
    const folded = foldedRun(throwingLedger(checkedLedger(store.ledger)), ops, { owner: { scope: run.scope }, at: run.at, language: run.language, mint: mintFactId });
    store.records.recordRun({ ...rest, ...folded });
}

export function seed(store: Store, recap: Recap): void {
    const at = recap.at ?? instant(1);
    const facts = { scope: recap.scope, at, cause: 'imported', backend: recap.backend, language: recap.language, costUsd: recap.costUsd } as const;
    if (recap.at !== null) {
        recordOps(store, { ...facts, error: recap.error, sessions: recap.sessions, tasks: recap.tasks, ops: recap.tasks.map((task) => ({ task: task.id, ops: task.sections === null ? [] : opsOfSections(task.sections) })) });
    } else if (recap.sessions.length > 0) {
        store.records.advance({ scope: recap.scope, at, error: recap.error, sessions: recap.sessions });
    }
    if (recap.running) {
        store.records.beginRun(recap.scope, recap.backend, at);
    }
}

export const cursor = (pane: string, position = 100): SessionCursor => ({ key: paneId(pane), agent: agentKind('claude'), transcript: sourcePathOf(`/t/${pane}`), cursor: cursorOf(position), tail: null, title: null, lastPrompt: null, harnessRecap: null });

export const newId = (): Uint8Array => ids.next();

export function must<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) {
        throw new Error('expected a value, got none');
    }
    return value;
}

export interface RunQuery {
    readonly tab: string | null;
    readonly since: number | null;
    readonly limit: number;
    readonly withInput: boolean;
}

export const filterOf = (query: RunQuery): RunFilter => ({
    tab: query.tab === null ? null : uncheckedTabId(query.tab),
    since: query.since === null ? null : instant(query.since),
    limit: countOf(query.limit),
    input: query.withInput ? 'with-input' : 'any',
});

export const runsOf = (inputs: RunInputReader, query: RunQuery): readonly RunRecord[] => inputs.runs(filterOf(query));

export const runIdOf = (value: string): RunId => brand<string, 'RunId'>(value);

export const verdictOf = (over: { readonly run: RunId; readonly item: string | null; readonly check: string; readonly pass: boolean; readonly critique?: string | null; readonly judge: string; readonly at: number; readonly source: 'judge' | 'operator' }): VerdictRecord => ({
    run: over.run, item: over.item === null ? null : textOf(over.item), check: textOf(over.check), pass: over.pass ? 'pass' : 'fail',
    critique: over.critique === undefined || over.critique === null ? null : textOf(over.critique), judge: textOf(over.judge), at: instant(over.at), source: over.source,
});
