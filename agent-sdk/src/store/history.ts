import type { MigrationHistory } from '@stateforge-labs/session-ledger-sqlite';

export const HISTORY: MigrationHistory = [
    {
        version: 1,
        name: 'recap, last run, marks and facts',
        up: [
            `CREATE TABLE recap (
                scope TEXT PRIMARY KEY,
                lanes TEXT NOT NULL,
                tasks TEXT NOT NULL,
                at INTEGER,
                running INTEGER NOT NULL,
                backend TEXT,
                error TEXT,
                cost_usd REAL NOT NULL,
                language TEXT NOT NULL
            ) STRICT`,
            `CREATE TABLE last_run (
                scope TEXT PRIMARY KEY,
                at INTEGER NOT NULL,
                cause TEXT NOT NULL
            ) STRICT`,
            `CREATE TABLE mark (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scope TEXT NOT NULL,
                at INTEGER NOT NULL,
                body TEXT NOT NULL
            ) STRICT`,
            `CREATE TABLE fact (
                id TEXT PRIMARY KEY,
                tab TEXT NOT NULL,
                task_key TEXT NOT NULL,
                section TEXT NOT NULL,
                text TEXT NOT NULL,
                why TEXT,
                ref TEXT,
                agent TEXT,
                anchor TEXT,
                first_at INTEGER NOT NULL,
                last_at INTEGER NOT NULL,
                state TEXT NOT NULL,
                closed_why TEXT,
                closed_at INTEGER,
                language TEXT NOT NULL
            ) STRICT`,
            'CREATE INDEX fact_task ON fact (tab, task_key)',
            'CREATE INDEX mark_scope ON mark (scope)',
        ],
    },
];
