import type { Database } from 'bun:sqlite';

export interface Migration {
    readonly version: number;
    readonly name: string;
    readonly up: string | readonly string[] | ((db: Database) => void);
}
