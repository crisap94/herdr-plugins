import type { DatabaseSync } from 'node:sqlite';

/**
 * One numbered step of the schema. Append-only: a released migration is never edited, a fix is a new number.
 * `up` is a list of SQL statements, or a function when the step needs more (a table rebuild, a data fix).
 * The runner switches `foreign_keys` off for the upgrade (a table rebuild needs that) and checks `foreign_key_check` before it commits.
 */
export interface Migration {
    readonly version: number;
    readonly name: string;
    readonly up: string | readonly string[] | ((db: DatabaseSync) => void);
}
