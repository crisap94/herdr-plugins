import { describe, test } from 'node:test';
import type { Database } from 'bun:sqlite';
import { TabViewsRepository } from '#src/adapters/db/tab-views.ts';
import { expectSameEffect } from './parity.ts';

const exec = (sql: string) => (db: Database): void => { db.exec(sql); };
const dump = (db: Database): unknown => ({ tab: db.prepare('SELECT id, column_pane, view_at, daemon_version FROM tab ORDER BY id').all(), lanes: db.prepare('SELECT * FROM lane ORDER BY tab_id, position').all() });
const SEED = "PRAGMA foreign_keys = OFF; INSERT INTO tab (id, first_seen, last_seen) VALUES ('t1', 1, 1); INSERT INTO lane (tab_id, pane, position, agent, status) VALUES ('t1', 'old', 0, 'claude', 'idle')";

describe('parity: tab views', () => {
    test('writeTab replaces the lanes and sets the view like the old UPDATE, DELETE and INSERTs', () => {
        expectSameEffect({
            seed: exec(SEED),
            raw: (db) => {
                db.prepare('UPDATE tab SET column_pane = ?, view_at = ?, daemon_version = ? WHERE id = ?').run('c1', 50, '1.0', 't1');
                db.prepare('DELETE FROM lane WHERE tab_id = ?').run('t1');
                db.prepare('INSERT INTO lane (tab_id, pane, position, agent, status, title, cwd, last_prompt, web_base, web_forge, web_branch, context_tokens, context_window, context_source, since) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                    .run('t1', 'p1', 0, 'claude', 'working', 'T', '/w', null, 'https://x', 'gitlab', 'main', 10, 100, 'agent', 7);
                db.prepare('INSERT INTO lane (tab_id, pane, position, agent, status, title, cwd, last_prompt, web_base, web_forge, web_branch, context_tokens, context_window, context_source, since) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                    .run('t1', 'p2', 1, 'codex', 'idle', null, null, null, null, null, null, null, null, null, null);
            },
            builder: (db) => {
                new TabViewsRepository(db).writeTab({
                    tab: 't1', column: 'c1', at: 50, daemonVersion: '1.0',
                    lanes: [
                        { pane: 'p1', agent: 'claude', status: 'working', title: 'T', cwd: '/w', lastPrompt: null, web: { base: 'https://x', forge: 'gitlab', branch: 'main' }, context: { tokens: 10, window: 100, source: 'agent' }, since: 7 },
                        { pane: 'p2', agent: 'codex', status: 'idle', title: null, cwd: null, lastPrompt: null, web: null, context: null },
                    ],
                } as never);
            },
            dump,
        });
    });

    test('reads return the lanes in position order', () => {
        expectSameEffect({
            seed: exec(`${SEED}; UPDATE tab SET view_at = 5, column_pane = 'c'; INSERT INTO lane (tab_id, pane, position, agent, status, since) VALUES ('t1', 'b', 1, 'x', 's', 3)`),
            raw: () => undefined,
            builder: (db) => {
                const repo = new TabViewsRepository(db);
                const view = repo.readTab('t1');
                const panes = view?.lanes.map((lane) => lane.pane);
                if (JSON.stringify(panes) !== '["old","b"]' || repo.tabOf('b') !== 't1' || repo.tabOf('zz') !== null || repo.readTab('nope') !== null) {
                    throw new Error('reads differ');
                }
            },
            dump,
        });
    });
});
