import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleLength } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import { withWorld, type Pane, type ViewWorld } from '../support/view-world.ts';
import { MIN, NOW, sections, showRecap, showTab, VERSION } from '../support/view-seeds.ts';

const LANES = [
    { pane: 'w1:p1', agent: 'claude', status: 'blocked', title: null },
    { pane: 'w1:p2', agent: 'codex', status: 'working', title: 'codex' },
] as const;
const LONG = '3.7.6-rc.12345678901234567890';
const AT = NOW - 3 * MIN;

const inWorld = <T>(use: (world: ViewWorld) => Promise<T>, version = VERSION): Promise<T> => withWorld({ now: NOW, version }, use);

async function bar<T>(world: ViewWorld, cols: number, use: (pane: Pane, line: string) => Promise<T>): Promise<T> {
    const pane = await world.pane({ cols, rows: 3, role: 'bar' });
    try {
        const screen = await pane.painted((seen) => seen.plain.some((line) => line.includes('📝')), 'the bar paints');
        return await use(pane, screen.plain[0] ?? '');
    } finally {
        await pane.close();
    }
}

test('the bar is one row: a dot per lane, then what needs you before what is happening now', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, LANES);
        showRecap(world, { at: AT, sections: sections({ goal: 'migrate', now: ['running CI'], needs: ['approve the deploy'] }) });
        await bar(world, 70, async (pane, line) => {
            assert.equal(pane.screen()?.plain.length, 1, 'one row: the bar is small');
            assert.match(line, /^📝●● needs you: approve the deploy/u);
            assert.ok(visibleLength(line) <= 68);
        });
    });
});

test('with nothing that needs you the bar says what is happening now', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, LANES);
        showRecap(world, { at: AT, sections: sections({ now: ['running CI'] }) });
        await bar(world, 70, async (_pane, line) => {
            assert.match(line, /running CI/);
            assert.doesNotMatch(line, /needs you/);
        });
    });
});

test('the bar speaks Spanish: te necesita first, then ahora', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        world.setLocale('es');
        showTab(world, LANES);
        showRecap(world, { at: AT, language: 'es', sections: sections({ needs: ['aprueba el despliegue'], now: ['ejecutando CI'] }) });
        await bar(world, 70, async (_pane, line) => {
            assert.match(line, /te necesita: aprueba el despliegue/);
        });
    });
    await inWorld(async (world) => {
        world.setLocale('es');
        showTab(world, LANES);
        showRecap(world, { at: AT, language: 'es', sections: sections({ now: ['ejecutando CI'] }) });
        await bar(world, 70, async (_pane, line) => {
            assert.match(line, /ejecutando CI/);
            assert.doesNotMatch(line, /te necesita/);
        });
    });
});

test('with every fact done the bar says all done; with nothing written, no recap yet', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: null }]);
        showRecap(world, { at: AT, sections: sections({ done: ['Added backoff'] }) });
        await bar(world, 70, async (_pane, line) => {
            assert.match(line, /all done/);
            assert.doesNotMatch(line, /no recap yet/);
        });
    });
    await inWorld(async (world) => {
        showTab(world, [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: null }]);
        await bar(world, 70, async (_pane, line) => {
            assert.match(line, /no recap yet/);
        });
    });
    await inWorld(async (world) => {
        world.setLocale('es');
        showTab(world, [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: null }]);
        showRecap(world, { at: AT, language: 'es', sections: sections({ goal: 'Subir el archivo', done: ['agregar reintento'] }) });
        await bar(world, 70, async (_pane, line) => {
            assert.match(line, /todo hecho/);
        });
    });
    await inWorld(async (world) => {
        world.setLocale('es');
        showTab(world, [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: null }]);
        await bar(world, 70, async (_pane, line) => {
            assert.match(line, /aún sin resumen/);
        });
    });
});

test('a recap stored before the fixed structure still gives the bar its headline, in both languages and whichever language its headings are in', { timeout: 30_000 }, async () => {
    const cases = [
        ['en', '## Goal\n- migrate\n\n## Now\n- running **CI** on !940\n\n## Waiting on you\n- approve the `prod` deploy\n', /needs you: approve the prod deploy/],
        ['en', '## Goal\n- migrate\n\n## Now\n- running **CI** on !940\n', /running CI on !940/],
        ['es', '## Objetivo\n- migrar\n\n## Ahora\n- ejecutando **CI** en !940\n\n## Esperando tu respuesta\n- aprueba el despliegue de `prod`\n', /te necesita: aprueba el despliegue de prod/],
        ['es', '## Objetivo\n- migrar\n\n## Ahora\n- ejecutando **CI** en !940\n', /ejecutando CI en !940/],
        ['es', '## Goal\n- x\n\n## Waiting on you\n- the OK\n', /te necesita: the OK/],
        ['en', '## Objetivo\n- x\n\n## Esperando tu respuesta\n- el OK\n', /needs you: el OK/],
    ] as const;
    for (const [locale, markdown, expected] of cases) {
        await inWorld(async (world) => {
            world.setLocale(locale);
            showTab(world, [{ pane: 'w1:p1', agent: 'claude', status: 'blocked', title: null }]);
            showRecap(world, { at: AT, language: locale, markdown });
            await bar(world, 90, async (_pane, line) => {
                assert.match(line, expected);
            });
        });
    }
});

test('the version tag shows in the bar when it fits', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, LANES);
        showRecap(world, { at: AT, sections: sections({ now: ['running CI'] }) });
        await bar(world, 60, async (_pane, line) => {
            assert.ok(line.endsWith(' · v3.7.6'), line);
        });
    });
});

test('a version too long to fit is left out and the bar never wraps or overflows', { timeout: 60_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, LANES);
        showRecap(world, { at: AT, sections: sections({ now: ['running CI on a long branch that needs a few more words to fill the row'], needs: ['approve'] }) });
        for (const cols of [14, 20, 24, 32, 40, 48, 60, 100]) {
            await bar(world, cols, async (pane, line) => {
                assert.equal(pane.screen()?.plain.length, 1, `${cols} cells: one row`);
                assert.ok(visibleLength(line) <= Math.max(10, cols - 2), `${cols} cells: "${line}"`);
                assert.equal(line.includes('rc.123'), cols >= 60, `${cols} cells: "${line}"`);
            });
        }
    }, LONG);
});

test('a long version shows in a bar wide enough for it and still fits', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        showTab(world, LANES);
        showRecap(world, { at: AT, sections: sections({ now: ['running CI'] }) });
        await bar(world, 90, async (_pane, line) => {
            assert.ok(line.endsWith(` · v${LONG}`), line);
            assert.ok(visibleLength(line) <= 88);
        });
    }, LONG);
});
