import { rebuildRequestsForCurate } from './007-request.ts';
import type { Migration } from './migration.ts';

/** Migration 7: a task keeps the curator's last paragraph and when its run began; the request queue may ask for a curation. */
export const m007: Migration = {
    version: 7,
    name: 'curator',
    up: (db): void => {
        db.exec('ALTER TABLE task ADD COLUMN story_text TEXT');
        db.exec('ALTER TABLE task ADD COLUMN story_at INTEGER');
        rebuildRequestsForCurate(db);
    },
};
