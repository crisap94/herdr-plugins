import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { visibleLength } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import { screenOf, withWorld, type Screen, type ViewWorld } from '../support/view-world.ts';
import { MIN, NOW, sections, showRecap, showTab, VERSION } from '../support/view-seeds.ts';

const AT = NOW - 3 * MIN;
const ESC = String.fromCodePoint(0x1b);
const SGR = new RegExp(`${ESC}\\[[0-9;]*m`, 'u');
const WIDE = '📝📝📝📝📝📝📝📝📝📝 ✅✅✅✅✅✅✅✅✅✅ done';
const LONG_WORD = 'averylongunbreakablewordthatmustbecutsomewhere';
const LINK = 'https://git.example/group/herdr-plugins/-/merge_requests/34/diffs?view=inline&very=long&query=string';
const TEXT = sections({ goal: 'Ship the uploader', now: [WIDE, LONG_WORD], needs: ['Approve the prod deploy'], links: [`merge request ${LINK}`] });
const LANES = [{ pane: 'w1:p1', agent: 'claude', status: 'working', title: 'work 📝 done ✅', lastPrompt: 'do 📝 things ✅' }] as const;

const inWorld = <T>(use: (world: ViewWorld) => Promise<T>): Promise<T> => withWorld({ now: NOW, version: VERSION, agents: ['claude'] }, use);

function seeded(world: ViewWorld): void {
    showTab(world, LANES);
    showRecap(world, { at: AT, sections: TEXT });
}

async function column(world: ViewWorld, cols: number, env: Readonly<Record<string, string>> = {}): Promise<Screen> {
    const pane = await world.pane({ cols, rows: 60, env });
    try {
        return await pane.painted((screen) => screen.text.includes('LINKS'), 'the column paints');
    } finally {
        await pane.close();
    }
}

const NO_COLOUR_SWITCHES = [{ NO_COLOR: '1' }, { FORCE_COLOR: '0' }, { NODE_DISABLE_COLORS: '1' }] as const;

test('wide characters, an unbreakable word and a long link wrap inside the column at every width', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        seeded(world);
        for (const cols of [14, 20, 30, 40, 80]) {
            const screen = await column(world, cols);
            assert.ok(screen.plain.every((line) => visibleLength(line) <= Math.max(10, cols - 2)), `${cols} cells: a row is wider than the pane`);
            assert.ok(screen.text.includes('averylong'), `${cols} cells: the long word starts on a row`);
        }
    });
});

test('a long link is drawn whole across the rows it needs and nothing of it is lost', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        seeded(world);
        const screen = await column(world, 40);
        const joined = screen.plain.join('').replaceAll(' ', '');
        assert.ok(joined.includes(LINK.replaceAll(' ', '')), 'every character of the link is on the screen');
        assert.ok(screen.plain.every((line) => visibleLength(line) <= 38));
    });
});

test('a colour terminal gets colour: bold titles and grey details carry escapes', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        seeded(world);
        const screen = await column(world, 60);
        assert.ok(screen.lines.some((line) => line.includes(`${ESC}[1m`) && line.includes(`${ESC}[22m`)), 'a bold run is closed');
        assert.ok(screen.lines.some((line) => line.includes(`${ESC}[90m`) && line.includes(`${ESC}[39m`)), 'a grey run is closed');
    });
});

for (const switchOff of NO_COLOUR_SWITCHES) {
    const [name] = Object.keys(switchOff);
    test(`with ${name} set the column has no colour code and the same visible text`, { timeout: 30_000 }, async () => {
        await inWorld(async (world) => {
            seeded(world);
            const coloured = await column(world, 40);
            const plain = await column(world, 40, switchOff);
            assert.ok(plain.lines.every((line) => !SGR.test(line)), `${name}: an escape is left`);
            assert.deepEqual(plain.plain, coloured.plain);
        });
    });
}

test('the one-row bar draws colour on a colour terminal and none under the colour switches, with the same visible text', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        seeded(world);
        const barOf = async (env: Readonly<Record<string, string>>): Promise<Screen> => {
            const pane = await world.pane({ cols: 70, rows: 3, role: 'bar', env });
            try {
                return await pane.painted((screen) => screen.plain.some((line) => line.includes('📝')), 'the bar paints');
            } finally {
                await pane.close();
            }
        };
        const coloured = await barOf({});
        assert.ok(coloured.lines.some((line) => SGR.test(line)), 'a colour terminal gets colour in the bar');
        for (const switchOff of NO_COLOUR_SWITCHES) {
            const plain = await barOf(switchOff);
            assert.ok(plain.lines.every((line) => !SGR.test(line)), `${Object.keys(switchOff)[0]}: an escape is left in the bar`);
            assert.deepEqual(plain.plain, coloured.plain);
        }
    });
});

test('a pipe, not a terminal, gets no colour from the settings screen, drawn at the 40-cell default', { timeout: 30_000 }, async () => {
    await inWorld(async (world) => {
        const child = spawn(process.execPath, [join(world.plugin, 'src', 'setup', 'launch.mjs')], { cwd: world.plugin, env: world.childEnv(), stdio: ['pipe', 'pipe', 'ignore'] });
        const closed = new Promise((resolve) => { child.once('close', resolve); });
        let bytes = '';
        child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.toString(); });
        try {
            const deadline = Date.now() + 15_000;
            while (screenOf(bytes)?.text.includes('TAB RECAP') !== true && Date.now() < deadline) {
                await new Promise((resolve) => { setTimeout(resolve, 20); });
            }
            const screen = screenOf(bytes);
            assert.ok(screen !== null && screen.text.includes('TAB RECAP'), `the settings paint into a pipe: ${JSON.stringify(bytes.slice(-300))}`);
            assert.ok(screen.lines.every((line) => !SGR.test(line)));
            assert.ok(screen.plain.every((line) => visibleLength(line) <= 40));
        } finally {
            child.kill('SIGTERM');
            await closed;
        }
    });
});

test('the settings screen takes the colour switches too: colour on a colour terminal, none under NO_COLOR, FORCE_COLOR=0 and NODE_DISABLE_COLORS', { timeout: 60_000 }, async () => {
    await inWorld(async (world) => {
        const coloured = await world.settings({ cols: 80, rows: 30 });
        try {
            const screen = await coloured.painted((seen) => seen.text.includes('TAB RECAP'), 'the settings paint');
            assert.ok(screen.lines.some((line) => SGR.test(line)), 'a colour terminal gets colour in the settings');
        } finally {
            await coloured.close();
        }
        for (const switchOff of NO_COLOUR_SWITCHES) {
            const pane = await world.settings({ cols: 80, rows: 30, env: switchOff });
            try {
                const screen = await pane.painted((seen) => seen.text.includes('TAB RECAP'), 'the settings paint');
                assert.ok(screen.lines.every((line) => !SGR.test(line)), `${Object.keys(switchOff)[0]}: an escape is left in the settings`);
            } finally {
                await pane.close();
            }
        }
    });
});
