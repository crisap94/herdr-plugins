import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Directory } from '@stateforge-labs/session-ledger';
import type { Store } from '#src/adapters/db/database.ts';
import { databaseFile, openStoreAt } from '#src/adapters/db/database.ts';
import { daemonWorld, type DaemonWorld, type Ran } from '../support/daemon-world.ts';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;
const NOW = Date.now();
const CLOSED = NOW - DAY;
const OLDER = NOW - 10 * DAY;
const OLDEST = NOW - 12 * DAY;
const RECENT = NOW - 30 * MINUTE;
const HOSTILE = 'Ship\u001b[31m the\u0007 cart\n\tnow\u0000';
const CLEANED = 'Ship[31m the cart now';
const TABLES = ['tab', 'chapter', 'run', 'task', 'run_task', 'fact', 'closed_lane', 'request', 'lane', 'transcript'];

const key = (n: number): string => `X'${Buffer.alloc(16, n).toString('hex')}'`;
const RUN_NEW = key(2);
const RUN_OLD = key(4);
const RUN_RECENT = key(8);
const TASK = key(3);
const TASK_BAD = key(5);
const TASK_RECENT = key(9);

interface Fact {
    readonly n: number;
    readonly section: string;
    readonly text: string;
    readonly first: number;
    readonly closedAt?: number;
}

const FACTS: readonly Fact[] = [
    { n: 10, section: 'goal', text: 'open before the close', first: CLOSED - 5000 },
    { n: 11, section: 'now', text: 'closed after the close', first: CLOSED - 1000, closedAt: CLOSED + 1000 },
    { n: 14, section: 'next', text: 'first seen after the close', first: CLOSED + 1000 },
    { n: 15, section: 'goal', text: 'open before every close', first: OLDEST - 1000 },
];

const RECENT_FACTS: readonly Fact[] = [
    { n: 30, section: 'goal', text: 'open before the recent close', first: RECENT - 3 * HOUR },
    { n: 31, section: 'done', text: 'closed ten minutes before the recent close', first: RECENT - 3 * HOUR, closedAt: RECENT - 10 * MINUTE },
    { n: 32, section: 'done', text: 'closed three hours before the recent close', first: RECENT - 4 * HOUR, closedAt: RECENT - 3 * HOUR },
];

const factSql = (fact: Fact, task: string, run: string, tab: string): string => {
    const closed = fact.closedAt === undefined ? "'open', NULL, NULL" : `'closed', 'done', ${fact.closedAt}`;
    return `INSERT INTO fact (id, tab_id, task_id, section, text, why, ref, agent, first_at, last_at, state, closed_why, closed_at, born_run, last_run, language) VALUES (${key(fact.n)}, '${tab}', ${task}, '${fact.section}', '${fact.text}', NULL, NULL, NULL, ${fact.first}, ${fact.first}, ${closed}, ${run}, ${run}, 'en');`;
};

const SEED = `
INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1), ('w2:t1', 1, 1), ('w3:t1', 1, 1);
INSERT INTO chapter (id, tab_id, n, started_at) VALUES (${key(1)}, 'w1:t1', 1, 10), (${key(6)}, 'w2:t1', 1, 10), (${key(12)}, 'w3:t1', 1, 10);
INSERT INTO run (id, chapter_id, at, cause, backend, language, cost_micro_usd, error) VALUES (${RUN_NEW}, ${key(1)}, ${CLOSED - 600_000}, 'turn-ended', 'codex', 'en', 1, NULL), (${RUN_OLD}, ${key(1)}, ${OLDER - 600_000}, 'turn-ended', 'codex', 'en', 1, NULL), (${key(7)}, ${key(6)}, ${CLOSED - 600_000}, 'turn-ended', 'codex', 'en', 1, NULL), (${RUN_RECENT}, ${key(12)}, ${RECENT - 5 * HOUR}, 'turn-ended', 'codex', 'en', 1, NULL);
INSERT INTO task (id, tab_id, key, story_text, story_at) VALUES (${TASK}, 'w1:t1', 't1', NULL, NULL), (${TASK_BAD}, 'w2:t1', 't2', NULL, NULL), (${TASK_RECENT}, 'w3:t1', 't3', NULL, NULL);
INSERT INTO run_task (run_id, task_id, position, name, legacy_markdown) VALUES (${RUN_NEW}, ${TASK}, 0, 'Alpha', NULL), (${RUN_OLD}, ${TASK}, 0, 'Alpha', NULL), (${key(7)}, ${TASK_BAD}, 0, 'Beta', NULL), (${RUN_RECENT}, ${TASK_RECENT}, 0, 'Gamma', NULL);
${FACTS.map((fact) => factSql(fact, TASK, RUN_NEW, 'w1:t1')).join('\n')}
${RECENT_FACTS.map((fact) => factSql(fact, TASK_RECENT, RUN_RECENT, 'w3:t1')).join('\n')}
INSERT INTO closed_lane (tab_id, pane, closed_at, agent, cwd, task_id, task_name) VALUES
 ('w1:t1', 'w1:p1', ${CLOSED}, 'claude', '/work/tree', ${TASK}, 'Alpha'),
 ('w1:t1', 'w1:p4', ${CLOSED}, 'codex', NULL, NULL, NULL),
 ('w1:t1', 'w1:p3', ${CLOSED - DAY}, 'claude', NULL, ${TASK}, ?),
 ('w1:t1', 'w1:p2', ${OLDER}, 'codex', NULL, ${TASK}, 'Alpha'),
 ('w1:t1', 'w1:p5', ${OLDEST}, 'claude', NULL, ${TASK}, 'Alpha'),
 ('w2:t1', 'w2:p6', ${CLOSED}, 'claude', NULL, ${TASK_BAD}, 'Beta'),
 ('w3:t1', 'w3:p7', ${RECENT}, 'claude', NULL, ${TASK_RECENT}, 'Gamma');`;

const BAD_FACT = `PRAGMA ignore_check_constraints = ON;
INSERT INTO fact (id, tab_id, task_id, section, text, why, ref, agent, first_at, last_at, state, closed_why, closed_at, born_run, last_run, language) VALUES (${key(20)}, 'w2:t1', ${TASK_BAD}, 'mood', 'a fact the ledger cannot read', NULL, NULL, NULL, ${CLOSED - 1000}, ${CLOSED - 1000}, 'open', NULL, NULL, ${key(7)}, ${key(7)}, 'en');
PRAGMA ignore_check_constraints = OFF;`;

const seeded = (store: Extract<Store, { readonly kind: 'ready' }>): void => {
    const [tables, closures] = SEED.split('INSERT INTO closed_lane');
    store.db.exec(tables ?? '');
    store.db.prepare(`INSERT INTO closed_lane${closures ?? ''}`).run(HOSTILE);
    store.db.exec(BAD_FACT);
};

const printed = (world: DaemonWorld, pane: string, closedAt: number, tab = 'w1:t1'): Promise<Ran> => world.command('handoff', '--print', '--from-closed', pane, '--tab', tab, '--closed-at', String(closedAt));

const setting = (world: DaemonWorld, days: string | null): void => {
    writeFileSync(join(world.configDir, 'config.env'), days === null ? '' : `TAB_RECAP_CLOSED_LANE_DAYS=${days}\n`);
};

const stateOf = (world: DaemonWorld): string => {
    const opened = openStoreAt(databaseFile(world.stateDir as Directory));
    if (opened.kind !== 'ready') {
        assert.fail('the store opens');
    }
    try {
        return JSON.stringify(TABLES.map((table) => opened.db.prepare(`SELECT * FROM ${table}`).all()), (_name, value: unknown) => (value instanceof Uint8Array ? Buffer.from(value).toString('hex') : value));
    } finally {
        opened.close();
    }
};

describe('a handoff printed from a closed lane', () => {
    let world: DaemonWorld;

    before(async () => {
        world = await daemonWorld();
        const opened = openStoreAt(databaseFile(world.stateDir as Directory));
        if (opened.kind !== 'ready') {
            assert.fail('the store opens');
        }
        seeded(opened);
        opened.close();
    });

    after(async () => {
        await world.close();
    });

    test('print writes the closure as the source: the last run, the close instant in place of a lane status, and newer prompts unknown', { timeout: 30_000 }, async () => {
        const ran = await printed(world, 'w1:p1', CLOSED);
        assert.equal(ran.code, 0, ran.stderr);
        assert.match(ran.stdout, /## Freshness\nlast run: \d{4}-\d\d-\d\d \d\d:\d\dZ, after a turn\nclosed at \d{4}-\d\d-\d\d \d\d:\d\dZ\nnewer prompts: unknown\nrefresh not requested\n/u);
        assert.doesNotMatch(ran.stdout, /lane status/u);
        assert.equal(ran.stderr, '');
    });

    test('the facts are those of the close: one closed later reads as open, one first seen after the close is out', { timeout: 30_000 }, async () => {
        const ran = await printed(world, 'w1:p1', CLOSED);
        assert.equal(ran.code, 0, ran.stderr);
        const sections = Object.fromEntries(ran.stdout.split('## ').slice(1).map((section) => [section.split('\n')[0], section]));
        assert.match(sections['Goal'] ?? '', /open before the close/u);
        assert.match(sections['Now'] ?? '', /closed after the close/u);
        assert.equal(sections['Recently closed'], undefined);
        assert.ok(!ran.stdout.includes('first seen after the close'));
    });

    test('a lane closed minutes ago hands over what was closed within two hours before the close, and not what was closed earlier', { timeout: 30_000 }, async () => {
        const ran = await printed(world, 'w3:p7', RECENT, 'w3:t1');
        assert.equal(ran.code, 0, ran.stderr);
        const closed = ran.stdout.split('## ').find((section) => section.startsWith('Recently closed')) ?? '';
        assert.match(closed, /closed ten minutes before the recent close/u);
        assert.ok(!ran.stdout.includes('closed three hours before the recent close'));
        assert.match(ran.stdout, /open before the recent close/u);
    });

    test('print writes no state: the store holds the same rows and no daemon was started', { timeout: 30_000 }, async () => {
        const held = stateOf(world);
        const ran = await printed(world, 'w1:p1', CLOSED);
        assert.equal(ran.code, 0, ran.stderr);
        assert.equal(stateOf(world), held);
        assert.equal(world.pidfile().pid, null);
    });

    test('a closure with no association with a task, and a closure that never happened, are refused as an unknown source', { timeout: 30_000 }, async () => {
        for (const [pane, closedAt] of [['w1:p4', CLOSED], ['w1:p9', CLOSED], ['w1:p1', CLOSED + 1]] as const) {
            const ran = await printed(world, pane, closedAt);
            assert.equal(ran.code, 1, `${pane} ${closedAt}`);
            assert.equal(ran.stdout, '');
            assert.match(ran.stderr, /^tab-recap: 1 — tab-recap does not know the source lane\n$/u);
        }
    });

    test('a closure whose task had no run yet at the close is refused with an empty ledger', { timeout: 30_000 }, async () => {
        const ran = await printed(world, 'w1:p5', OLDEST);
        assert.equal(ran.code, 1);
        assert.match(ran.stderr, /the source task has no recap yet/u);
    });

    test('a ledger that cannot be read fails the print and says the source could not be read', { timeout: 30_000 }, async () => {
        const ran = await printed(world, 'w2:p6', CLOSED, 'w2:t1');
        assert.equal(ran.code, 1);
        assert.match(ran.stderr, /tab-recap: 1 — the source transcript could not be read\n$/u);
        assert.equal(ran.stdout, '');
    });

    test('the window is TAB_RECAP_CLOSED_LANE_DAYS: a 10-day-old closure is outside 7 days and inside 14, and is inside when the setting is unset', { timeout: 30_000 }, async () => {
        setting(world, '7');
        assert.equal((await printed(world, 'w1:p2', OLDER)).code, 1);
        assert.equal((await printed(world, 'w1:p1', CLOSED)).code, 0);
        setting(world, '14');
        assert.equal((await printed(world, 'w1:p2', OLDER)).code, 0);
        setting(world, null);
        assert.equal((await printed(world, 'w1:p2', OLDER)).code, 0);
    });

    test('a window of 0 refuses even a closure stored a day ago', { timeout: 30_000 }, async () => {
        setting(world, '0');
        const ran = await printed(world, 'w1:p1', CLOSED);
        assert.equal(ran.code, 1);
        assert.match(ran.stderr, /does not know the source lane/u);
        setting(world, null);
    });
});

describe('the closed lanes of a tab listed', () => {
    let world: DaemonWorld;

    const listed = (tab: string): Promise<Ran> => world.command('handoff', '--list-closed', '--tab', tab);

    before(async () => {
        world = await daemonWorld();
        const opened = openStoreAt(databaseFile(world.stateDir as Directory));
        if (opened.kind !== 'ready') {
            assert.fail('the store opens');
        }
        seeded(opened);
        opened.close();
    });

    after(async () => {
        await world.close();
    });

    test('one tab-separated line per closure, newest first and by pane within one instant, the task name last', { timeout: 30_000 }, async () => {
        const ran = await listed('w1:t1');
        assert.equal(ran.code, 0, ran.stderr);
        assert.deepEqual(ran.stdout.trimEnd().split('\n').map((line) => line.split('\t').slice(0, 3).join(' ')), [
            `w1:p1 claude ${CLOSED}`, `w1:p4 codex ${CLOSED}`, `w1:p3 claude ${CLOSED - DAY}`, `w1:p2 codex ${OLDER}`, `w1:p5 claude ${OLDEST}`,
        ]);
        assert.ok(ran.stdout.startsWith(`w1:p1\tclaude\t${CLOSED}\tAlpha\nw1:p4\tcodex\t${CLOSED}\t\n`));
    });

    test('a hostile task name loses its control characters and cannot add a line or a field', { timeout: 30_000 }, async () => {
        const ran = await listed('w1:t1');
        const line = ran.stdout.split('\n').find((each) => each.startsWith('w1:p3\t')) ?? '';
        assert.equal(line, `w1:p3\tclaude\t${CLOSED - DAY}\t${CLEANED}`);
        assert.equal(line.split('\t').length, 4);
        assert.ok(ran.stdout.split('').every((char) => char === '\n' || char === '\t' || char.charCodeAt(0) >= 32));
        assert.equal(ran.stdout.split('\n').length, 6);
    });

    test('a tab with no closed lane prints nothing, and a window of 0 hides every closure', { timeout: 30_000 }, async () => {
        const none = await listed('w9:t9');
        assert.equal(none.code, 0, none.stderr);
        assert.equal(none.stdout, '');
        setting(world, '0');
        const off = await listed('w1:t1');
        assert.equal(off.code, 0, off.stderr);
        assert.equal(off.stdout, '');
        setting(world, '7');
        const week = await listed('w1:t1');
        assert.deepEqual(week.stdout.trimEnd().split('\n').map((line) => line.split('\t')[0]), ['w1:p1', 'w1:p4', 'w1:p3']);
    });
});
