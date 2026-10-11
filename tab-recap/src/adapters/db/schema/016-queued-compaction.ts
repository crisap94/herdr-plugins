import type { Migration } from './migration.ts';

export const m016: Migration = {
    version: 16,
    name: 'queued-compaction',
    up: ['ALTER TABLE compaction ADD COLUMN queued INTEGER NOT NULL DEFAULT 0 CHECK (queued IN (0,1))'],
};
