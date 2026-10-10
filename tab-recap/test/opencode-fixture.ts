import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface Fixture {
    readonly db: string;
    add(message: { id: string; session: string; role: string; updated: number; parts: readonly object[]; data?: object }): void;
    close(): void;
}

export type ToolStatus = 'completed' | 'error' | 'running' | 'pending';

export function toolPart(status: ToolStatus, state: Readonly<Record<string, unknown>> = {}): object {
    return { type: 'tool', state: { ...state, status } };
}

export function opencodeFixture(dir: string): Fixture {
    const db = join(dir, 'opencode.db');
    const writer = new DatabaseSync(db);
    writer.exec('PRAGMA journal_mode = WAL');
    writer.exec('CREATE TABLE session (id text PRIMARY KEY, directory text NOT NULL, parent_id text, title text NOT NULL, time_updated integer NOT NULL, time_archived integer)');
    writer.exec('CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)');
    writer.exec('CREATE TABLE part (id text PRIMARY KEY, message_id text NOT NULL, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)');
    const session = writer.prepare('INSERT INTO session VALUES (?, ?, ?, ?, ?, ?)');
    session.run('ses_new', '/repo', null, 'Fix the build', 50, null);
    session.run('ses_old', '/repo', null, 'Old', 10, null);
    session.run('ses_child', '/repo', 'ses_new', 'Subagent', 99, null);
    session.run('ses_gone', '/repo', null, 'Archived', 98, 1);
    session.run('ses_other', '/elsewhere', null, 'Other', 97, null);
    let parts = 0;
    return {
        db,
        add: ({ id, session: sessionId, role, updated, parts: list, data = {} }): void => {
            writer.prepare('INSERT INTO message VALUES (?, ?, ?, ?, ?)').run(id, sessionId, updated, updated, JSON.stringify({ role, ...data }));
            for (const part of list) {
                parts += 1;
                writer.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)').run(`prt_${parts}`, id, sessionId, updated, updated, JSON.stringify(part));
            }
        },
        close: (): void => { writer.close(); },
    };
}

