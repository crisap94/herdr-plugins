import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ids } from '#src/adapters/db/uuid7.ts';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { storeOver } from '#src/adapters/db/database.ts';
import type { Store, StoreOptions } from '#src/adapters/db/database.ts';
import { opsOfSections } from '#src/adapters/db/import/sections-to-ops.ts';
import type { LaneCursor, TabRecap } from '#src/ports/recap-records.ts';

export function memoryStore(options: StoreOptions = {}): Store {
    const opened = openDatabase(MEMORY);
    if (opened.kind !== 'ready') {
        throw new Error('a fresh in-memory database is never newer');
    }
    return storeOver(opened.db, options);
}

export const scratchDir = (name: string): string => mkdtempSync(join(tmpdir(), `recap-${name}-`));

export function seed(store: Store, recap: TabRecap): void {
    const at = recap.at ?? 1;
    const facts = { tab: recap.tab, at, cause: 'imported', backend: recap.backend, language: recap.language, costUsd: recap.costUsd } as const;
    if (recap.at !== null) {
        store.records.recordRun({ ...facts, error: recap.error, lanes: recap.lanes, tasks: recap.tasks, ops: recap.tasks.map((task) => ({ task: task.id, ops: task.sections === null ? [] : opsOfSections(task.sections) })) });
    } else if (recap.lanes.length > 0) {
        store.records.advance({ tab: recap.tab, at, error: recap.error, lanes: recap.lanes });
    }
    if (recap.running) {
        store.records.beginRun(recap.tab, recap.backend, at);
    }
}

export const cursor = (pane: string, position = 100): LaneCursor => ({ pane, agent: 'claude', transcript: `/t/${pane}`, cursor: position, tail: null, title: null, lastPrompt: null, claudeRecap: null });

export const newId = (): Uint8Array => ids.next();

export function must<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) {
        throw new Error('expected a value, got none');
    }
    return value;
}
