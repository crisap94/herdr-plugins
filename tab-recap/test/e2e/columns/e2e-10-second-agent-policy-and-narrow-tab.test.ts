import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { configText, prepareStateStore, seedConfig, withWorld } from '../support/view-world.ts';
import { NOW, VERSION } from '../support/view-seeds.ts';
import { columnsWorld, COLUMN_PANE, TAB, type Cells, type ColumnsWorld, type TabSpec } from '../support/columns-world.ts';

interface Opened {
    readonly direction: string;
    readonly target_pane_id: string;
    readonly env: Readonly<Record<string, string>>;
}

const cells = (x: number, y: number, width: number, height: number): Cells => ({ x, y, width, height });

const tabOf = (n: number, agent: string, pane: string, width = 189, extra: TabSpec['panes'] = []): TabSpec => ({
    tab: `w1:t${n}`,
    area: cells(0, 0, width, 40),
    panes: [{ id: pane, agent, tab: `w1:t${n}`, rect: cells(0, 0, width, 40) }, ...extra],
    splits: [],
});

const seen = (world: ColumnsWorld): readonly string[] => [...new Set(world.requests('plugin.pane.open')
    .map((request) => request.params as Opened)
    .map((params) => `${params.env['TAB_RECAP_TAB']} ${params.env['TAB_RECAP_SHAPE']} ${params.direction} ${params.target_pane_id}`))]
    .toSorted();

const watchesEvery = (world: ColumnsWorld, panes: readonly string[]): boolean => world.requests('events.subscribe')
    .some((request) => panes.every((pane) => JSON.stringify(request.params).includes(`"pane_id":"${pane}"`)));

const watched = async (world: ColumnsWorld, panes: readonly string[]): Promise<void> => {
    const deadline = Date.now() + 15_000;
    while (!watchesEvery(world, panes)) {
        assert.ok(Date.now() < deadline, `the daemon never watched ${panes.join(', ')}`);
        await new Promise<void>((resolve) => { setTimeout(resolve, 25); });
    }
};

const settled = async (world: ColumnsWorld, columns: number, watching: readonly string[]): Promise<void> => {
    const deadline = Date.now() + 15_000;
    while (seen(world).length < columns) {
        assert.ok(Date.now() < deadline, `only ${seen(world).length} of ${columns} columns opened`);
        await new Promise<void>((resolve) => { setTimeout(resolve, 25); });
    }
    await watched(world, watching);
    await world.quiet();
};

describe('a narrow tab, a tab at the minimum, an agent outside the policy and opencode', () => {
    let world: ColumnsWorld;

    before(async () => {
        world = await columnsWorld();
        world.show(tabOf(2, 'claude', 'w1:p3', 109), tabOf(3, 'gemini', 'w1:p5'), tabOf(4, 'opencode', 'w1:p7'), tabOf(5, 'claude', 'w1:p11', 110));
        await world.started();
        await settled(world, 3, ['w1:p3', 'w1:p7', 'w1:p11']);
    });

    after(async () => {
        await world.close();
    });

    test('opencode opens a side column by default', { timeout: 30_000 }, () => {
        assert.ok(seen(world).includes('w1:t4 side right w1:p7'));
    });

    test('an agent outside the policy opens none', { timeout: 30_000 }, () => {
        assert.deepEqual(seen(world).filter((line) => line.startsWith('w1:t3 ')), []);
        assert.equal(seen(world).length, 3);
    });

    test('a tab one cell below the side-column minimum opens a bar and no side column, and one at the minimum a side column', { timeout: 30_000 }, () => {
        assert.deepEqual(seen(world).filter((line) => line.startsWith('w1:t2 ')), ['w1:t2 bar down w1:p3']);
        assert.deepEqual(seen(world).filter((line) => line.startsWith('w1:t5 ')), ['w1:t5 side right w1:p11']);
    });
});

describe('a second agent in a tab that has its column', () => {
    let world: ColumnsWorld;
    let opensBefore: number;

    const area = cells(0, 0, 189, 40);
    const first: TabSpec = { area, panes: [{ id: 'w1:p1', agent: 'claude', rect: area }], splits: [] };
    const opened: TabSpec = {
        area,
        panes: [{ id: 'w1:p1', agent: 'claude', rect: cells(0, 0, 100, 40) }, { id: COLUMN_PANE, title: 'tab-recap', label: 'Recap', rect: cells(101, 0, 88, 40) }],
        splits: [{ direction: 'right', ratio: 0.5, rect: area }],
    };
    const both: TabSpec = {
        area,
        panes: [{ id: 'w1:p1', agent: 'claude', rect: cells(0, 0, 60, 40) }, { id: 'w1:p2', agent: 'codex', rect: cells(61, 0, 40, 40) }, opened.panes[1] as TabSpec['panes'][number]],
        splits: [{ direction: 'right', ratio: 0.5, rect: area }],
    };

    before(async () => {
        world = await columnsWorld();
        await world.opened([first], [opened]);
        opensBefore = world.requests('plugin.pane.open').length;
        world.show(both);
        world.world.herdr.push({ event: 'pane_agent_detected', data: { type: 'pane_agent_detected', pane: { pane_id: 'w1:p2', tab_id: TAB, workspace_id: 'w1', agent: 'codex', agent_status: 'idle', cwd: '/work', foreground_cwd: '/work', focused: false, revision: 1, terminal_id: 'term-w1:p2' } } });
        await watched(world, ['w1:p1', 'w1:p2']);
        await world.quiet();
    });

    after(async () => {
        await world.close();
    });

    test('is watched like the first and leaves one column: none is opened or closed for it', { timeout: 30_000 }, () => {
        assert.equal(opensBefore, 1);
        assert.equal(world.requests('plugin.pane.open').length, 1);
        assert.equal(world.requests('pane.close').length, 0);
    });
});

const worldWith = async (env: Readonly<Record<string, string>>, file: string | null, agents: readonly string[]): Promise<ColumnsWorld> => {
    const world = await columnsWorld(env);
    if (file !== null) {
        world.configure(file);
    }
    world.show(...agents.map((agent, at) => tabOf(at + 1, agent, `w1:p${at + 1}`)));
    await world.started();
    return world;
};

const opened = async (world: ColumnsWorld, agents: readonly string[], expected: readonly string[]): Promise<readonly string[]> => {
    await settled(world, expected.length, agents.flatMap((agent, at) => (expected.includes(agent) ? [`w1:p${at + 1}`] : [])));
    return seen(world).map((line) => agents[Number(/^w1:t(\d+)/.exec(line)?.[1]) - 1] ?? line).toSorted();
};

describe('the screen agents setting widens the policy', () => {
    const AGENTS = ['gemini', 'qwen', 'copilot', 'mistral', 'opencode', 'codex'];
    let world: ColumnsWorld;
    let got: readonly string[];

    before(async () => {
        world = await worldWith({}, 'TAB_RECAP_SCREEN_AGENTS=Gemini, qwen  copilot!\n', AGENTS);
        got = await opened(world, AGENTS, ['gemini', 'qwen', 'copilot', 'opencode', 'codex']);
    });

    after(async () => {
        await world.close();
    });

    test('config.env names the kinds read from the screen, any case and separator, and they keep the default kinds', { timeout: 30_000 }, () => {
        assert.deepEqual(got, ['codex', 'copilot', 'gemini', 'opencode', 'qwen']);
    });

    test('a kind that is named nowhere still opens none', { timeout: 30_000 }, () => {
        assert.ok(!got.includes('mistral'));
    });
});

describe('the agents setting replaces the default kinds, and the environment wins over config.env', () => {
    const AGENTS = ['gemini', 'qwen', 'claude', 'codex', 'opencode'];
    let world: ColumnsWorld;
    let got: readonly string[];

    before(async () => {
        world = await worldWith({ TAB_RECAP_AGENTS: 'claude', TAB_RECAP_SCREEN_AGENTS: 'qwen' }, 'TAB_RECAP_SCREEN_AGENTS=gemini\n', AGENTS);
        got = await opened(world, AGENTS, ['claude', 'qwen']);
    });

    after(async () => {
        await world.close();
    });

    test('only the listed agents and the screen kinds of the environment open a column', { timeout: 30_000 }, () => {
        assert.deepEqual(got, ['claude', 'qwen']);
    });
});

describe('all is a wildcard', () => {
    const AGENTS = ['gemini', 'mistral', 'claude', 'codex'];
    let world: ColumnsWorld;
    let got: readonly string[];

    before(async () => {
        world = await worldWith({ TAB_RECAP_AGENTS: 'claude', TAB_RECAP_SCREEN_AGENTS: 'gemini, ALL' }, null, AGENTS);
        got = await opened(world, AGENTS, AGENTS);
    });

    after(async () => {
        await world.close();
    });

    test('every agent opens a column, whatever its kind', { timeout: 30_000 }, () => {
        assert.deepEqual(got, ['claude', 'codex', 'gemini', 'mistral']);
    });
});

const written = async (world: Parameters<typeof configText>[0], expected: string): Promise<void> => {
    const deadline = Date.now() + 15_000;
    while (configText(world) !== expected && Date.now() < deadline) {
        await new Promise<void>((resolve) => { setTimeout(resolve, 25); });
    }
    assert.equal(configText(world), expected);
};

test('the Screen agents row of the settings keeps one clean list: names in lower case, no empty one, and all alone when it is among them', { timeout: 60_000 }, async () => {
    await withWorld({ now: NOW, version: VERSION, agents: ['claude', 'codex'] }, async (editing) => {
        seedConfig(editing, '# mine\n');
        prepareStateStore(editing);
        const settings = await editing.settings({ cols: 100, rows: 60, env: {} });
        try {
            await settings.painted((screen) => /● claude/.test(screen.text), 'the settings found the agents');
            for (const key of ['j', 'j', 'j', 'j', '\r', '\u0015', ...Array.from('Gemini,,Qwen'), '\r', 's']) {
                await settings.press(key);
            }
            await settings.painted((screen) => /Screen agents\s+gemini,qwen/.test(screen.text), 'the list reads gemini,qwen');
            await written(editing, '# mine\nTAB_RECAP_SCREEN_AGENTS=gemini,qwen\n');
            for (const key of ['\r', '\u0015', ...Array.from('gemini, ALL'), '\r', 's']) {
                await settings.press(key);
            }
            await settings.painted((screen) => /Screen agents\s+every agent herdr recognises/.test(screen.text), 'the list reads every agent herdr recognises');
            await written(editing, '# mine\nTAB_RECAP_SCREEN_AGENTS=all\n');
        } finally {
            await settings.close();
        }
    });
});
