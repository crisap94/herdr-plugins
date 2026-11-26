import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { instant, textOf, usdOf, type Operation, type Recap, type Unknown } from '@stateforge-labs/session-ledger';
import { PublishingRecords } from '#src/adapters/desktop/publishing-records.ts';
import { openStoreAt, type Store } from '#src/adapters/db/database.ts';
import { desktopFrontend } from '#src/adapters/desktop/frontend.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { paneIdOf, type ScopeId } from '#src/recap/domain/ids.ts';
import { cursor, recordOps } from '#test/db/support.ts';
import { v2Problems } from '#test/gui-schema-support.ts';
import { tabId } from '#test/support/ids.ts';
import { viewRecord } from '#test/support/tab-view-records.ts';
import { recapDaemonWorld, type RecapDaemonWorld } from '../support/recap-daemon-world.ts';

const BROKEN = 'w9:t9';
const SECOND_SESSION = '00000000-0000-4000-8000-0000000000a2';
const WHY = Array.from({ length: 30 }, (_, at) => `reason${at}`).join(' ');
const FIRST_ANSWER = `Here you go:\n\`\`\`json\n${JSON.stringify({ ops: [
    { op: 'add', section: 'goal', text: 'Add a cart to the shop', anchor: 'Add a cart to the shop' },
    { op: 'add', section: 'decisions', text: 'Store carts in SQLite', why: WHY, agent: 'a1', anchor: 'Use SQLite for it, no server' },
    { op: 'add', section: 'rules', text: 'Never push to main', anchor: 'Use SQLite for it, no server' },
] })}\n\`\`\``;

describe('the daemon follows a claude lane', () => {
    let world: RecapDaemonWorld;
    let second: { grow(said: readonly string[]): void };

    const runs = (): readonly Record<string, unknown>[] => world.rows('SELECT cause, backend, language, cost_micro_usd AS cost, error FROM run ORDER BY at');
    const calls = (): number => world.model.calls().length;

    before(async () => {
        world = await recapDaemonWorld({ TAB_RECAP_RUN_PACING: 'turn' });
        world.model.answer(1, FIRST_ANSWER);
        world.model.answer('default', JSON.stringify({ ops: [] }));
        world.announce();
        world.grow(1);
        await world.start();
    });

    after(async () => {
        await world.close();
    });

    test('the agent finishes a turn and the model is called once, with what the agent wrote', { timeout: 30_000 }, async () => {
        world.turn();
        await world.until(() => (runs().length === 1 ? true : undefined), 'the run of the turn');
        assert.equal(calls(), 1);
        const document = world.model.calls()[0] ?? '';
        assert.match(document, /<agent id="a1" kind="claude" label="orchestrator" pane="w1:p1"/);
        assert.ok(document.includes('Add a cart to the shop') && document.includes('Use SQLite for it, no server'));
    });

    test('the run, its facts and its cost are in the store', { timeout: 30_000 }, () => {
        assert.deepEqual(runs().map((run) => [run['cause'], run['backend'], run['language'], run['cost'], run['error']]), [['turn-ended', 'custom/bun', 'en', 0, null]]);
        const facts = world.rows('SELECT section, text, why, agent, state FROM fact ORDER BY first_at, id');
        assert.deepEqual(facts.map((fact) => [fact['section'], fact['text'], fact['agent'], fact['state']]), [
            ['goal', 'Add a cart to the shop', null, 'open'], ['decisions', 'Store carts in SQLite', 'orchestrator', 'open'], ['rules', 'Never push to main', null, 'open'],
        ]);
        assert.equal(facts[1]?.['why'], `${Array.from({ length: 24 }, (_, at) => `reason${at}`).join(' ')}…`);
    });

    test('the column shows the sections, and the rules are stored but not drawn', { timeout: 30_000 }, async () => {
        const screen = await world.column(60, 40).painted((shown) => shown.text.includes('Add a cart to the shop') && shown.text.includes('Store carts in SQLite'), 'the column shows the goal and the decision');
        assert.match(screen.text, /GOAL\nAdd a cart to the shop/);
        assert.match(screen.text, /DECISIONS\n.*Store carts in SQLite/);
        assert.match(screen.text, /custom\/bun/);
        assert.ok(!screen.text.includes('Never push to main'));
    });

    test('the next turn sends the facts numbered from f1, oldest first, each with the agent that wrote it', { timeout: 30_000 }, async () => {
        world.turn();
        await world.until(() => (runs().length === 2 ? true : undefined), 'the second run');
        assert.equal(calls(), 2);
        const document = world.model.calls()[1] ?? '';
        assert.deepEqual([...document.matchAll(/<fact id="(f\d+)" section="(\w+)"([^>]*)>/g)].map((fact) => [fact[1], fact[2], /agent="a1"/.test(fact[3] ?? '')]), [['f1', 'goal', false], ['f2', 'decisions', true], ['f3', 'rules', false]]);
    });

    test('the lane follows the session herdr reports for the pane', { timeout: 30_000 }, async () => {
        second = world.transcript(SECOND_SESSION, ['Switch the cart to Postgres']);
        world.reports(SECOND_SESSION);
        world.status('working');
        world.status('idle');
        await world.until(() => (runs().length === 3 ? true : undefined), 'the run of the new session');
        assert.ok((world.model.calls()[2] ?? '').includes('Switch the cart to Postgres'));
        assert.equal(world.rows('SELECT COUNT(*) AS n FROM transcript')[0]?.['n'], 2, 'both sessions are known to the store');
    });

    test('a detection that names no session keeps the session the lane followed', { timeout: 30_000 }, async () => {
        second.grow(['Add the migration to src/db.ts']);
        world.detects();
        world.status('working');
        world.status('idle');
        await world.until(() => (runs().length === 4 ? true : undefined), 'the run after the detection');
        assert.ok((world.model.calls()[3] ?? '').includes('Add the migration to src/db.ts'));
    });
});

const noteOf = (name: string): Operation => ({ op: 'add', section: 'needs', text: textOf(name), why: null, ref: null, at: instant(5_000), agent: null });

class Locked extends PublishingRecords {
    override readRecap(tab: ScopeId): Recap | Unknown | null {
        if (tab === tabId(BROKEN)) { throw new Error('database is locked'); }
        return super.readRecap(tab);
    }
}

describe('the desktop frontend publishes the tabs the daemon recapped', () => {
    const STATUSES = ['idle', 'working', 'done', 'blocked', 'unknown', 'idle', 'working', 'done', 'blocked', 'idle'];
    const SLASH = 'w1:2/3';
    let root = '';
    let gui = '';
    let wrapped: Store;
    const logged: string[] = [];
    const saved = { home: process.env['HOME'], state: process.env['TAB_RECAP_STATE'] };

    const seed = (tab: string, pane: string, lanes: readonly Record<string, unknown>[], ops: readonly Operation[]): void => {
        recordOps(wrapped, { scope: tabId(tab), at: instant(10_000), cause: 'turn-ended', backend: textOf('custom'), language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [cursor(pane)], tasks: [{ id: textOf('t1'), name: textOf('Cart'), sessions: [paneIdOf(pane)] }], ops: [{ task: textOf('t1'), ops }] });
        wrapped.views.writeTab(viewRecord({ tab, column: null, at: 10_000, lanes }));
    };

    const index = (): { readonly tabs: readonly Record<string, unknown>[] } => JSON.parse(readFileSync(join(gui, 'index.json'), 'utf8'));
    const tabsListed = (): readonly unknown[] => index().tabs.map((row) => row['tab']);
    const rowOf = (tab: string): Record<string, unknown> => {
        const found = index().tabs.find((row) => row['tab'] === tab);
        if (found === undefined) { throw new Error(`no index row for ${tab}`); }
        return found;
    };

    before(() => {
        root = mkdtempSync(join(tmpdir(), 'tab-recap-gui-e2e-'));
        process.env['HOME'] = join(root, 'home');
        process.env['TAB_RECAP_STATE'] = root;
        gui = join(root, 'gui');
        const opened = openStoreAt(join(root, 'tab-recap.db') as FsPath);
        if (opened.kind !== 'ready') { throw new Error('a fresh state opens a store'); }
        const unreadable = new Locked(opened.records, () => undefined);
        wrapped = desktopFrontend().wrap({ ...opened, records: unreadable }, (line) => { logged.push(String(line)); }, () => Promise.resolve());
    });

    after(() => {
        wrapped.close();
        for (const [name, value] of [['HOME', saved.home], ['TAB_RECAP_STATE', saved.state]] as const) {
            if (value === undefined) { delete process.env[name]; } else { process.env[name] = value; }
        }
        rmSync(root, { recursive: true, force: true });
    });

    test('a tab recapped by the daemon leaves a valid document and an index row, and a tab id with a slash gets one safe file name', { timeout: 30_000 }, () => {
        seed(SLASH, 'w1:p1', [{ pane: 'w1:p1', agent: 'claude', status: 'blocked', title: 'cart', cwd: '/work' }, { pane: 'w1:p2', agent: 'codex', status: 'working', title: null, cwd: null }], [noteOf('Approve the deploy of !34')]);
        assert.deepEqual(readdirSync(gui).filter((name) => name.endsWith('.json') && !['index.json', 'api.json'].includes(name)), ['w1%3A2%2F3.json']);
        const document = JSON.parse(readFileSync(join(gui, 'w1%3A2%2F3.json'), 'utf8'));
        assert.deepEqual(v2Problems(document), []);
        assert.equal(document.status, 'blocked');
        assert.deepEqual(document.tasks.map((task: { sections: { needs: string[] } }) => task.sections.needs), [['Approve the deploy of !34']]);
    });

    test('the index row gives the headline, the needs, the wait and the lanes by urgency, capped, with the count of all', { timeout: 30_000 }, () => {
        const row = rowOf(SLASH);
        assert.equal(row['headline'], 'Approve the deploy of !34');
        assert.equal(row['needs'], 1);
        assert.equal(row['waitingSince'], 5_000);
        assert.deepEqual((row['lanes'] as { status: string }[]).map((lane) => lane.status), ['blocked', 'working']);
        seed('w1:4', 'w1:p0', STATUSES.map((status, at) => ({ pane: `w1:p${at}`, agent: 'claude', status, title: null, cwd: null })), []);
        const crowded = rowOf('w1:4');
        assert.equal(crowded['laneCount'], 10);
        assert.deepEqual((crowded['lanes'] as { status: string }[]).map((lane) => lane.status), ['blocked', 'blocked', 'done', 'done', 'working', 'working', 'idle', 'idle']);
    });

    test('the index lists the newest tab first, and survives a second publish of the same tab', { timeout: 30_000 }, () => {
        assert.deepEqual(tabsListed(), ['w1:4', SLASH]);
        wrapped.views.writeTab(viewRecord({ tab: SLASH, column: null, at: 20_000, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'cart', cwd: '/work' }] }));
        assert.equal(index().tabs.filter((row) => row['tab'] === SLASH).length, 1);
        assert.equal(rowOf(SLASH)['status'], 'idle');
    });

    test('a read that fails is logged with its reason, publishes nothing for that tab, and leaves the other tabs published', { timeout: 30_000 }, () => {
        assert.doesNotThrow(() => { wrapped.views.writeTab(viewRecord({ tab: BROKEN, column: null, at: 30_000, lanes: [{ pane: 'w9:p1', agent: 'claude', status: 'idle', title: null, cwd: null }] })); });
        assert.ok(logged.some((line) => line.includes(`gui: tab ${BROKEN} not published: database is locked`)), logged.join('\n'));
        assert.ok(!tabsListed().includes(BROKEN));
        assert.ok(tabsListed().includes(SLASH) && tabsListed().includes('w1:4'));
    });
});
