import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Directory } from '@stateforge-labs/session-ledger';
import { databaseFile, openStoreAt } from '#src/adapters/db/database.ts';
import { compactionWorld, type CompactionWorld } from '../support/compaction-world.ts';
import { configText, seedConfig, viewWorld, type Pane, type ViewWorld } from '../support/view-world.ts';
import { NOW, VERSION } from '../support/view-seeds.ts';

const ASKED = 'tab-recap: compaction requested\n';
const LIMIT = 280;
const ESC = String.fromCodePoint(0x1b);
const BELL = String.fromCodePoint(7);
const CSI_CLOSE = String.fromCodePoint(0x9b);

type Row = readonly [string, string, string | null, string | null];

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const rows = (made: CompactionWorld): readonly Row[] => made.world.rows('SELECT kind, target, pane, note FROM request ORDER BY at, id').map((row) => [textOrNull(row['kind']) ?? '', textOrNull(row['target']) ?? '', textOrNull(row['pane']), textOrNull(row['note'])]);

const popups = (made: CompactionWorld): readonly Record<string, unknown>[] => made.world.world.herdr.requests().filter((each) => each.method === 'plugin.pane.open').map((each) => each.params as Record<string, unknown>);

async function world(env: Readonly<Record<string, string>>, store: 'ready' | 'absent' = 'ready'): Promise<CompactionWorld> {
    const made = await compactionWorld(env);
    made.world.world.herdr.reply('plugin.pane.open' as never, { type: 'ok' } as never);
    if (store === 'ready') {
        const opened = openStoreAt(databaseFile(made.world.world.stateDir as Directory));
        if (opened.kind !== 'ready') {
            throw new Error('a fresh state directory opens a store');
        }
        opened.close();
    }
    return made;
}

async function asked(made: CompactionWorld, ...args: readonly string[]): Promise<Row | undefined> {
    const had = rows(made).length;
    const ran = await made.world.world.command('compact', ...args);
    assert.equal(ran.code, 0, ran.stderr);
    assert.equal(ran.stdout, ASKED);
    assert.equal(rows(made).length, had + 1);
    return rows(made).at(-1);
}

describe('compact with the note setting on skip', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await world({ TAB_RECAP_COMPACT_NOTE: ' SKIP ' });
    });

    after(async () => {
        await made.close();
    });

    test('with no --note the request is queued at once with no note, and no popup opens', { timeout: 30_000 }, async () => {
        assert.deepEqual(await asked(made), ['compact', 'w1:t1', 'w1:p2', null]);
        assert.deepEqual(popups(made), []);
    });

    test('a multi-line note is one line in the request row', { timeout: 30_000 }, async () => {
        assert.deepEqual(await asked(made, '--note', 'keep  the\nschema\r\nand the  tests '), ['compact', 'w1:t1', 'w1:p2', 'keep the schema and the tests']);
    });

    test('a note longer than the popup allows is cut to 280 characters', { timeout: 30_000 }, async () => {
        const row = await asked(made, '--note', 'x'.repeat(LIMIT + 50));
        assert.equal(Array.from(row?.[3] ?? '').length, LIMIT);
    });

    test('a cut that lands on a space leaves no trailing space', { timeout: 30_000 }, async () => {
        const row = await asked(made, '--note', `${'x'.repeat(LIMIT - 1)} tail`);
        assert.equal(row?.[3], 'x'.repeat(LIMIT - 1));
    });

    test('a tab or a newline is a space, an escape or a bell is dropped', { timeout: 30_000 }, async () => {
        assert.equal((await asked(made, '--note', `a\tb${ESC}[31mred${BELL} x`))?.[3], 'a b[31mred x');
        assert.equal((await asked(made, '--note', `keep${CSI_CLOSE} this`))?.[3], 'keep this');
    });

    test('a note of nothing but control characters or blanks is no note', { timeout: 30_000 }, async () => {
        assert.equal((await asked(made, '--note', `${BELL}${ESC}`))?.[3], null);
        assert.equal((await asked(made, '--note', '   '))?.[3], null);
        assert.equal((await asked(made, '--note', ''))?.[3], null);
    });
});

describe('compact with the note setting on ask, and with a setting it does not know', () => {
    let made: CompactionWorld;
    let unknown: CompactionWorld;

    before(async () => {
        made = await world({ TAB_RECAP_COMPACT_NOTE: 'ask' });
        unknown = await world({ TAB_RECAP_COMPACT_NOTE: 'maybe' });
    });

    after(async () => {
        await made.close();
        await unknown.close();
    });

    test('with no --note the popup is asked for, for this tab and pane, and nothing is queued', { timeout: 30_000 }, async () => {
        const ran = await made.world.world.command('compact');
        assert.equal(ran.code, 0, ran.stderr);
        assert.equal(ran.stdout, ASKED);
        const opened = popups(made)[0];
        assert.ok(opened !== undefined);
        assert.equal(popups(made).length, 1);
        assert.equal(opened['entrypoint'], 'compact');
        assert.equal(opened['placement'], 'popup');
        assert.deepEqual(opened['env'], { TAB_RECAP_TAB: 'w1:t1', TAB_RECAP_PANE: 'w1:p2', TAB_RECAP_STATE: made.world.world.stateDir });
        assert.deepEqual(rows(made), []);
    });

    test('a note given on the command line is queued at once and opens no popup', { timeout: 30_000 }, async () => {
        assert.deepEqual(await asked(made, '--note', 'keep the schema'), ['compact', 'w1:t1', 'w1:p2', 'keep the schema']);
        assert.equal(popups(made).length, 1);
    });

    test('an empty note given on the command line is queued with no note and opens no popup', { timeout: 30_000 }, async () => {
        assert.deepEqual(await asked(made, '--note', '   '), ['compact', 'w1:t1', 'w1:p2', null]);
        assert.equal(popups(made).length, 1);
    });

    test('a setting it does not know is ask: the popup opens', { timeout: 30_000 }, async () => {
        const ran = await unknown.world.world.command('compact');
        assert.equal(ran.stdout, ASKED);
        assert.equal(popups(unknown).length, 1);
        assert.deepEqual(rows(unknown), []);
    });
});

describe('compact from a tab with no pane known', () => {
    let made: CompactionWorld;

    before(async () => {
        made = await world({ TAB_RECAP_COMPACT_NOTE: 'skip', HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ tab_id: 'w1:t1' }) });
    });

    after(async () => {
        await made.close();
    });

    test('the request is queued for the tab alone', { timeout: 30_000 }, async () => {
        assert.deepEqual(await asked(made), ['compact', 'w1:t1', null, null]);
    });
});

describe('compact when the popup cannot open or the request cannot be queued', () => {
    let noHerdr: CompactionWorld;
    let noStore: CompactionWorld;

    before(async () => {
        noHerdr = await world({ TAB_RECAP_COMPACT_NOTE: 'ask' });
        noStore = await world({ TAB_RECAP_COMPACT_NOTE: 'skip' }, 'absent');
        await noHerdr.world.world.herdr.stop();
    });

    after(async () => {
        await noHerdr.close();
        await noStore.close();
    });

    test('with no herdr the operator is told the popup did not open, and nothing is queued', { timeout: 30_000 }, async () => {
        const ran = await noHerdr.world.world.command('compact');
        assert.equal(ran.code, 1);
        assert.equal(ran.stdout, '');
        assert.match(ran.stderr, /^tab-recap: 1 — .+\n$/u);
        assert.deepEqual(rows(noHerdr), []);
    });

    test('with a state store that is not ready the operator is told, and the exit code says failed', { timeout: 30_000 }, async () => {
        const ran = await noStore.world.world.command('compact', '--note', 'keep the schema');
        assert.equal(ran.code, 1);
        assert.equal(ran.stdout, '');
        assert.match(ran.stderr, /the compaction was not requested \(unreadable: the state store is not ready\)/u);
    });
});

describe('the compact note row of the settings modal', () => {
    let modal: ViewWorld;
    let pane: Pane;

    const text = (): string => pane.screen()?.text ?? '';

    before(async () => {
        modal = await viewWorld({ now: NOW, version: VERSION, agents: ['claude'] });
        seedConfig(modal, '# mine\nTAB_RECAP_GLOW=450\n');
        pane = await modal.settings({ cols: 100, rows: 60 });
        await pane.painted((screen) => /Compact note\s+ask — open a note before compacting/u.test(screen.text), 'the note row reads ask');
    });

    after(async () => {
        await pane.close();
        await modal.close();
    });

    test('a fresh install asks for a note, and choosing skip writes exactly TAB_RECAP_COMPACT_NOTE=skip', { timeout: 30_000 }, async () => {
        for (const key of ['j', 'j', 'j', 'j', 'j', 'j', 'j', '\r', 'j', '\r']) {
            await pane.press(key);
        }
        await pane.painted((screen) => /Compact note\s+skip — compact at once/u.test(screen.text), 'the note row reads skip');
        assert.equal(configText(modal), '# mine\nTAB_RECAP_GLOW=450\n');
        await pane.press('s');
        await pane.painted((screen) => screen.text.includes('saved — applies to the next recap'), 'saved');
        assert.equal(configText(modal), '# mine\nTAB_RECAP_GLOW=450\nTAB_RECAP_COMPACT_NOTE=skip\n');
        assert.ok(!/read-only/u.test(text()));
    });
});

describe('the compact note row when an environment variable sets it', () => {
    let modal: ViewWorld;
    let pane: Pane;

    before(async () => {
        modal = await viewWorld({ now: NOW, version: VERSION, agents: ['claude'] });
        seedConfig(modal, '# mine\nTAB_RECAP_COMPACT_NOTE=ask\n');
        pane = await modal.settings({ cols: 100, rows: 60, env: { TAB_RECAP_COMPACT_NOTE: 'skip' } });
        await pane.painted((screen) => /Compact note\s+skip — compact at once/u.test(screen.text), 'the note row reads skip');
    });

    after(async () => {
        await pane.close();
        await modal.close();
    });

    test('the row is read-only, and a save of another row leaves it out of the file', { timeout: 30_000 }, async () => {
        for (const key of ['j', 'j', 'j', 'j', 'j', 'j', 'j', '\r']) {
            await pane.press(key);
        }
        await pane.painted((screen) => screen.text.includes('read-only: TAB_RECAP_COMPACT_NOTE is set in the environment'), 'the row is read-only');
        assert.equal(configText(modal), '# mine\nTAB_RECAP_COMPACT_NOTE=ask\n');
        for (const key of ['k', 'k', '\r', 'j', '\r']) {
            await pane.press(key);
        }
        await pane.painted((screen) => /Git note\s+off/u.test(screen.text), 'the git note row reads off');
        await pane.press('s');
        await pane.painted((screen) => screen.text.includes('saved — applies to the next recap'), 'the other row was saved');
        assert.equal(configText(modal), '# mine\nTAB_RECAP_COMPACT_NOTE=ask\nTAB_RECAP_GIT_NOTE=off\n');
        assert.doesNotMatch(configText(modal), /skip/u);
    });
});
