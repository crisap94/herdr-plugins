import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { withWorld, type Pane, type ViewWorld } from '../support/view-world.ts';
import { DAY, golden, HOUR, MIN, NOW, sections, showAlert, showRecap, showTab, VERSION } from '../support/view-seeds.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const AT = NOW - 3 * MIN;
const ALL = sections({ goal: 'Ship the uploader', now: ['Running CI on !940'], needs: ['Approve the prod deploy'], done: ['Added backoff'], decisions: ['Retry three times'], next: ['Add a retention sweep'], links: ['compaction records !34'] });
const LANES = [
    { pane: 'w1:p1', agent: 'claude', status: 'blocked', title: 'Victoria migration', lastPrompt: 'go' },
    { pane: 'w1:p2', agent: 'codex', status: 'working', title: 'codex', lastPrompt: 'run tests' },
] as const;
const SESSIONS = [
    { pane: 'w1:p1', agent: 'claude', title: 'Victoria migration', lastPrompt: 'go' },
    { pane: 'w1:p2', agent: 'codex', title: null, lastPrompt: 'run tests' },
] as const;

const inWorld = <T>(use: (world: ViewWorld) => Promise<T>): Promise<T> => withWorld({ now: NOW, version: VERSION }, use);

const open = (world: ViewWorld, cols: number, rows = 60, role: 'column' | 'modal' = 'column'): Promise<Pane> => world.pane({ cols, rows, role });

async function column<T>(world: ViewWorld, cols: number, rows: number, marker: string, use: (pane: Pane) => Promise<T>): Promise<T> {
    const pane = await open(world, cols, rows);
    try {
        await pane.painted((screen) => screen.text.includes(marker), `the column shows ${marker}`);
        return await use(pane);
    } finally {
        await pane.close();
    }
}

test('a tab with no agent says it waits for one, in English and in Spanish', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        await column(world, 40, 12, 'Waiting for an agent', async (pane) => {
            assert.match(pane.screen()?.text ?? '', /Waiting for an agent in this tab…/);
        });
        world.setLocale('es');
        await column(world, 60, 12, 'Esperando', async (pane) => {
            assert.match(pane.screen()?.text ?? '', /Esperando a que haya un agente/);
        });
    });
});

test('a tab with agents and no recap yet says so, in English and in Spanish', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, LANES);
        await column(world, 60, 24, 'No recap yet', async (pane) => {
            assert.match(pane.screen()?.text ?? '', /No recap yet\./);
        });
        world.setLocale('es');
        await column(world, 60, 24, 'Aún no hay resumen', async (pane) => {
            assert.match(pane.screen()?.text ?? '', /Aún no hay resumen/);
        });
    });
});

test('two agents, one tab: a header per agent, one recap for the tab, the idle note and the version line', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, LANES);
        showAlert(world, 'w1:p1', 'idle', NOW - 2 * MIN, ['main', '2 unmerged', 'dirty']);
        showRecap(world, { at: AT, sections: ALL, lanes: SESSIONS });
        await column(world, 80, 60, 'LINKS', async (pane) => {
            const text = pane.screen()?.text ?? '';
            for (const expected of ['Victoria migration', 'blocked', 'working', '⚑ idle 2m ago', '› go', '› run tests', 'TAB RECAP · 3m ago · claude/haiku · v3.7.6', 'GOAL', '• Running CI on !940']) {
                assert.ok(text.includes(expected), `missing ${expected}`);
            }
            assert.equal(text.split('GOAL').length, 2, 'the recap appears once, not once per agent');
            assert.doesNotMatch(text, /daemon v/);
        });
    });
});

test('a daemon of another version than the column\'s record is named stale', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, LANES, { daemonVersion: '3.7.5' });
        showRecap(world, { at: AT, sections: ALL });
        await column(world, 80, 60, 'LINKS', async (pane) => {
            assert.match(pane.screen()?.text ?? '', /daemon v3\.7\.5 — restart/);
        });
    });
});

for (const locale of ['en', 'es'] as const) {
    for (const cols of [30, 44, 80]) {
        test(`the painted column at ${cols} cells in ${locale} equals its golden, and no row is wider than the pane`, { timeout: 30_000 }, async () => {
            await inWorld(async (world) => {
                world.setLocale(locale);
                showTab(world, LANES);
                showAlert(world, 'w1:p1', 'idle', NOW - 2 * MIN, ['main', '2 unmerged', 'dirty']);
                showRecap(world, { at: AT, sections: ALL, language: locale, lanes: SESSIONS });
                await column(world, cols, 44, locale === 'en' ? 'LINKS' : 'ENLACES', async (pane) => {
                    const screen = pane.screen();
                    assert.ok(screen !== null);
                    assert.ok(screen.plain.every((line) => Array.from(line).length <= cols - 1), `a row is wider than ${cols} cells`);
                    golden(join(FIXTURES, `column-${locale}-${cols}.txt`), screen.plain);
                });
            });
        });
    }
}

test('the seven headings are drawn in the interface language, with a dash for each empty one', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, LANES);
        showRecap(world, { at: AT, sections: sections({ goal: 'Ship the uploader', now: ['Running CI'] }) });
        await column(world, 60, 60, 'LINKS', async (pane) => {
            const text = pane.screen()?.text ?? '';
            for (const heading of ['GOAL', 'NOW', 'NEEDS YOU', 'DONE', 'DECISIONS', 'NEXT', 'LINKS']) {
                assert.ok(text.includes(heading), heading);
            }
            assert.ok(text.includes('Ship the uploader') && text.includes('Running CI') && text.includes('—'));
            assert.ok(!text.includes('stale text'), 'the stored markdown is not shown when sections exist');
        });
        world.setLocale('es');
        await column(world, 60, 60, 'ENLACES', async (pane) => {
            const text = pane.screen()?.text ?? '';
            for (const heading of ['OBJETIVO', 'AHORA', 'TE NECESITA', 'HECHO', 'DECISIONES', 'SIGUIENTE', 'ENLACES']) {
                assert.ok(text.includes(heading), heading);
            }
        });
    });
});

test('the recap body has exactly one blank line between sections and none between a heading and its first line', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, LANES);
        showRecap(world, { at: AT, sections: sections({ goal: 'Ship it', now: ['Running CI'], done: ['Added backoff'] }) });
        await column(world, 60, 60, 'LINKS', async (pane) => {
            const lines = pane.screen()?.plain ?? [];
            const at = lines.indexOf('GOAL');
            assert.deepEqual(lines.slice(at, at + 20), ['GOAL', 'Ship it', '', 'NOW', '• Running CI', '', 'NEEDS YOU', '—', '', 'DONE', '• Added backoff', '', 'DECISIONS', '—', '', 'NEXT', '—', '', 'LINKS', '—']);
        });
    });
});

test('a recap stored before the fixed structure is shown as it was written, runs of blank lines collapsed', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, LANES);
        showRecap(world, { at: AT, markdown: '## Goal\n- a\n## Now\n- b\n\n\n\n## Waiting on you\n- answer me\n' });
        await column(world, 60, 40, 'WAITING ON YOU', async (pane) => {
            const lines = pane.screen()?.plain ?? [];
            const at = lines.indexOf('GOAL');
            assert.deepEqual(lines.slice(at, at + 8), ['GOAL', '• a', '', 'NOW', '• b', '', 'WAITING ON YOU', '• answer me']);
        });
    });
});

const AGES = [
    ['12 seconds', 12_000, '12s ago', 'hace 12 s'],
    ['5 minutes', 5 * MIN, '5m ago', 'hace 5 min'],
    ['3 hours', 3 * HOUR, '3h ago', 'hace 3 h'],
    ['2 days', 2 * DAY, '2d ago', 'hace 2 d'],
    ['no time at all', 0, '0s ago', 'hace 0 s'],
    ['119 seconds, rounded down to 1 minute', 119_000, '1m ago', 'hace 1 min'],
    ['47 hours, rounded down to 1 day', 47 * HOUR, '1d ago', 'hace 1 d'],
    ['a recap from the future (clock skew), read as zero seconds', -5 * MIN, '0s ago', 'hace 0 s'],
] as const;

for (const [name, age, english, spanish] of AGES) {
    test(`a recap ${name} old reads "${english}" and "${spanish}"`, { timeout: 30_000 }, async () => {
        await inWorld(async (world) => {
            showTab(world, LANES);
            showRecap(world, { at: AT, sections: ALL });
            world.setNow(AT + age);
            await column(world, 80, 60, 'LINKS', async (pane) => {
                assert.match(pane.screen()?.text ?? '', new RegExp(`TAB RECAP · ${english} · claude/haiku`));
                world.setLocale('es');
                world.refresh();
                await pane.painted((screen) => screen.text.includes(`RESUMEN DE PESTAÑA · ${spanish} ·`), `the column reads ${spanish}`);
            });
        });
    });
}

test('the live prompt heads a lane; the recap\'s last prompt shows only when there is none', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, [{ pane: 'w1:p1', agent: 'claude', status: 'working', title: 'x', lastPrompt: 'what was just typed' }]);
        showRecap(world, { at: AT, sections: ALL, lanes: [{ pane: 'w1:p1', agent: 'claude', title: 'x', lastPrompt: 'what the last recap saw' }] });
        await column(world, 60, 40, 'LINKS', async (pane) => {
            assert.match(pane.screen()?.text ?? '', /› what was just typed/);
            assert.doesNotMatch(pane.screen()?.text ?? '', /last recap saw/);
            showTab(world, [{ pane: 'w1:p1', agent: 'claude', status: 'working', title: 'x', lastPrompt: null }]);
            world.refresh();
            await pane.painted((screen) => screen.text.includes('› what the last recap saw'), 'the recap prompt shows when none was typed');
            assert.doesNotMatch(pane.screen()?.text ?? '', /just typed/);
            showTab(world, [{ pane: 'w1:p1', agent: 'claude', status: 'working', title: 'x' }]);
            world.refresh();
            await pane.painted((screen) => screen.text.includes('› what the last recap saw'), 'a view stored before the live prompt existed still shows it');
        });
    });
});

test('the footer: the column never says close, the modal does, and the roomy footers name the settings key', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, LANES);
        showRecap(world, { at: AT, sections: ALL });
        await column(world, 44, 60, 'tap: full screen', async (pane) => {
            const footer = pane.screen()?.plain.at(-1) ?? '';
            assert.match(footer, /tap: full screen/);
            assert.doesNotMatch(footer, /close/);
        });
        await column(world, 100, 60, 's settings', async (pane) => {
            assert.match(pane.screen()?.plain.at(-1) ?? '', /s settings/);
        });
        const modal = await open(world, 100, 60, 'modal');
        try {
            await modal.painted((screen) => /q close/.test(screen.plain.at(-1) ?? ''), 'the modal footer says how to close');
        } finally {
            await modal.close();
        }
        world.setLocale('es');
        await column(world, 120, 60, 's ajustes', async (pane) => {
            assert.match(pane.screen()?.plain.at(-1) ?? '', /s ajustes/);
        });
    });
});

async function footerOf(world: ViewWorld, cols: number, role: 'column' | 'modal'): Promise<string> {
    const pane = await open(world, cols, 24, role);
    try {
        const screen = await pane.painted((seen) => seen.plain.length > 1, `${role} at ${cols} cells paints`);
        return screen.plain.at(-1) ?? '';
    } finally {
        await pane.close();
    }
}

test('the footer fits every width down to a phone column, in both languages', { timeout: 60_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, LANES);
        showRecap(world, { at: AT, sections: ALL });
        for (const locale of ['en', 'es'] as const) {
            world.setLocale(locale);
            for (const cols of [14, 22, 32, 46, 82]) {
                for (const role of ['column', 'modal'] as const) {
                    const footer = await footerOf(world, cols, role);
                    assert.notEqual(footer, '', `${locale} ${role} ${cols}: a footer is drawn`);
                    assert.ok(Array.from(footer).length <= Math.max(10, cols - 2), `${locale} ${role} ${cols}: "${footer}"`);
                }
            }
        }
    });
});
