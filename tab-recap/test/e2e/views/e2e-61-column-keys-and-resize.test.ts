import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Method } from '@stateforge-labs/herdr-sdk';
import { sharedHerdr, withWorld, type Pane, type SharedHerdr, type ViewWorld } from '../support/view-world.ts';
import { MIN, NOW, sections, showRecap, showTab, VERSION } from '../support/view-seeds.ts';

const AT = NOW - 3 * MIN;
const LONG = sections({
    goal: 'Ship the uploader',
    now: Array.from({ length: 6 }, (_, at) => `Running check number ${at + 1}`),
    needs: ['Approve the prod deploy'],
    done: Array.from({ length: 6 }, (_, at) => `Finished step number ${at + 1}`),
    next: ['Add a retention sweep'],
    links: ['compaction records !34'],
});

let herdr: SharedHerdr;

before(async () => {
    herdr = await sharedHerdr();
});

after(async () => {
    await herdr.close();
});

const inWorld = <T>(use: (world: ViewWorld) => Promise<T>): Promise<T> => withWorld({ now: NOW, version: VERSION, herdr }, async (world) => {
    world.herdr.reply(Method.PluginPaneOpen, {
        type: 'plugin_pane_opened',
        plugin_pane: { entrypoint: 'setup', plugin_id: 'tab-recap', pane: { agent_status: 'idle', focused: true, pane_id: 'w1:p9', revision: 1, tab_id: 'w1:t1', terminal_id: 'term-9', workspace_id: 'w1' } },
    });
    showTab(world, [{ pane: 'w1:p1', agent: 'claude', status: 'working', title: 'Checkout' }]);
    showRecap(world, { at: AT, sections: LONG });
    return use(world);
});

const opened = (world: ViewWorld): readonly { readonly params: Record<string, unknown> }[] =>
    world.requests().filter((request) => request.method === 'plugin.pane.open').map((request) => ({ params: request.params as Record<string, unknown> }));

const envOf = (open: { readonly params: Record<string, unknown> }): Record<string, string> => open.params['env'] as Record<string, string>;

async function until<T>(probe: () => T | undefined, describe: string): Promise<T> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        const seen = probe();
        if (seen !== undefined) {
            return seen;
        }
        await new Promise((resolve) => { setTimeout(resolve, 20); });
    }
    throw new Error(`timed out: ${describe}`);
}

async function column<T>(world: ViewWorld, rows: number, use: (pane: Pane) => Promise<T>, cols = 50, role: 'column' | 'modal' = 'column'): Promise<T> {
    const pane = await world.pane({ cols, rows, role });
    try {
        await pane.painted((screen) => screen.text.includes('Ship the uploader') || screen.text.includes('GOAL'), 'the column paints');
        return await use(pane);
    } finally {
        await pane.close();
    }
}

const first = (pane: Pane): string => pane.screen()?.plain[0] ?? '';

test('j and k scroll the column one line; g and G jump to the top and the bottom; space and b page', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        await column(world, 12, async (pane) => {
            const top = first(pane);
            await pane.press('j');
            await pane.painted((screen) => screen.plain[0] !== top, 'j moved one line down');
            const second = first(pane);
            await pane.press('k');
            await pane.painted((screen) => screen.plain[0] === top, 'k moved back up');
            await pane.press('G');
            await pane.painted((screen) => screen.text.includes('compaction records !34'), 'G reaches the bottom');
            const bottom = pane.screen()?.plain ?? [];
            await pane.press('g');
            await pane.painted((screen) => screen.plain[0] === top, 'g jumps to the top');
            await pane.press(' ');
            await pane.painted((screen) => screen.plain[0] !== top && screen.plain[0] !== second, 'space pages down');
            const paged = first(pane);
            await pane.press('b');
            await pane.painted((screen) => screen.plain[0] === top, 'b pages back up');
            assert.notEqual(paged, top);
            assert.ok(bottom.includes('compaction records !34') || bottom.some((line) => line.includes('compaction records')));
            assert.equal(bottom.at(-1)?.includes('j/k'), true, 'the footer stays in place while the body scrolls');
        });
    });
});

test('Enter, and a tap, ask herdr for the full-screen modal of this tab', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        await column(world, 20, async (pane) => {
            await pane.press('\r');
            const modal = await until(() => opened(world)[0], 'herdr was asked to open the modal');
            assert.equal(envOf(modal)['TAB_RECAP_TAB'], 'w1:t1');
            assert.equal(envOf(modal)['TAB_RECAP_MODE'], 'modal');
            assert.equal(modal.params['placement'], 'popup');
            await pane.press('\u001B[<0;5;3M');
            await until(() => (opened(world).length === 2 ? true : undefined), 'a tap asks for the modal too');
        });
    });
});

test('r asks for a recap now and h hides the column', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        await column(world, 20, async (pane) => {
            await pane.press('r');
            await until(() => world.observed().find((seen) => seen.kind === 'requested'), 'r asked for a recap');
            await pane.press('h');
            const hidden = await until(() => world.observed().find((seen) => seen.kind === 'visibility'), 'h hid the column');
            assert.equal(hidden.hidden, true);
        });
    });
});

test('s starts the settings through the command launcher, from the plugin folder, for this tab', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        await column(world, 20, async (pane) => {
            await pane.press('s');
            const setup = await until(() => opened(world).find((open) => open.params['entrypoint'] === 'setup'), 'the launcher ran configure and herdr was asked for the settings');
            assert.equal(envOf(setup)['TAB_RECAP_TAB'], 'w1:t1');
            assert.equal(setup.params['placement'], 'popup');
            assert.deepEqual(world.log(), []);
        });
    });
});

test('c in the column asks herdr for the compaction note popup of this tab', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        await column(world, 20, async (pane) => {
            await pane.press('c');
            const popup = await until(() => opened(world).find((open) => open.params['entrypoint'] === 'compact'), 'herdr was asked for the compact popup');
            assert.equal(envOf(popup)['TAB_RECAP_TAB'], 'w1:t1');
            assert.equal(popup.params['placement'], 'popup');
        });
    });
});

test('c in the modal closes the modal and starts the command launcher, which asks for the compact popup', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        await column(world, 20, async (pane) => {
            await pane.press('c');
            assert.equal(await pane.exited(), 0, 'the modal closes itself');
            const popup = await until(() => opened(world).find((open) => open.params['entrypoint'] === 'compact'), 'the launcher ran compact and herdr was asked for the popup');
            assert.equal(envOf(popup)['TAB_RECAP_TAB'], 'w1:t1');
            assert.deepEqual(world.log(), []);
        }, 50, 'modal');
    });
});

test('resizing the pane repaints the view at the new size', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        await column(world, 30, async (pane) => {
            const wide = await pane.painted((screen) => screen.plain.length === 30, 'the column fills 30 rows');
            assert.ok(wide.plain.some((line) => line.includes('Running check number 1')));
            pane.resize(24, 12);
            const narrow = await pane.painted((screen) => screen.plain.length === 12, 'the column repaints at 12 rows');
            assert.ok(narrow.plain.every((line) => Array.from(line).length <= 22), 'no row is wider than the new pane');
            pane.resize(80, 20);
            await pane.painted((screen) => screen.plain.length === 20 && screen.plain.some((line) => line.length > 30), 'the column repaints wider and at 20 rows');
        });
    });
});
