// A live database with a tab of two chapters of 1.x recaps (item rows), for the tests of the fair comparison.
import assert from 'node:assert/strict';
import { openDatabase } from '#src/adapters/db/open.ts';
import { ids } from '#src/adapters/db/uuid7.ts';

export const MIN = 60_000;
export const T0 = Date.parse('2026-10-04T21:00:00Z');

/** In each chapter a failed run after a good one (the good one is the chapter's 1.x recap), and in the second a run with no items. */
export function liveDatabase(path: string): void {
    const opened = openDatabase(path);
    assert.equal(opened.kind, 'ready');
    const { db } = opened;
    db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, 1, 1)').run('w1:t1');
    const task = ids.next();
    db.prepare('INSERT INTO task (id, tab_id, key) VALUES (?, ?, ?)').run(task, 'w1:t1', 't1');
    const run = (chapter: Uint8Array, at: number, error: string | null, items: readonly (readonly [string, number, string])[]): void => {
        const id = ids.next();
        db.prepare("INSERT INTO run (id, chapter_id, at, cause, backend, language, cost_micro_usd, error) VALUES (?, ?, ?, 'turn-ended', 'claude', 'en', 0, ?)").run(id, chapter, at, error);
        db.prepare('INSERT INTO run_task (run_id, task_id, position) VALUES (?, ?, 0)').run(id, task);
        for (const [section, position, text] of items) {
            db.prepare("INSERT INTO item (run_id, task_id, view, section, position, text) VALUES (?, ?, 'recap', ?, ?, ?)").run(id, task, section, position, text);
        }
    };
    const [first, second] = [ids.next(), ids.next()];
    db.prepare('INSERT INTO chapter (id, tab_id, n, started_at) VALUES (?, ?, 1, 1)').run(first, 'w1:t1');
    db.prepare('INSERT INTO chapter (id, tab_id, n, started_at) VALUES (?, ?, 2, 2)').run(second, 'w1:t1');
    run(first, T0 + 10 * MIN, null, [['goal', 0, 'Add a cart'], ['done', 0, 'Cart model written']]);
    run(first, T0 + 20 * MIN, null, [['goal', 0, 'Add a cart to the shop'], ['done', 0, 'Cart model written in src/cart.ts'], ['next', 0, 'Add totals']]);
    run(first, T0 + 25 * MIN, 'timed out', [['goal', 0, 'a failed run is never the recap']]);
    run(second, T0 + 50 * MIN, null, [['goal', 0, 'Ship the cart'], ['done', 0, 'Totals added in src/totals.ts']]);
    run(second, T0 + 55 * MIN, null, []);
    db.close();
}
