import type { Migration } from './migration.ts';

/** Migration 2: where a lane's repository lives on the web (clickable references). Nullable columns, so no table is rebuilt. */
export const m002: Migration = {
    version: 2,
    name: 'lane-web',
    up: [
        'ALTER TABLE lane ADD COLUMN web_base TEXT',
        "ALTER TABLE lane ADD COLUMN web_forge TEXT CHECK (web_forge IN ('gitlab','github'))",
        'ALTER TABLE lane ADD COLUMN web_branch TEXT',
    ],
};
