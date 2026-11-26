import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings } from '#src/daemon/config.ts';
import { backendsWorld } from '../support/backends-world.ts';
import { judgingWorld, type EvalWorld } from '../support/eval-world.ts';
import { FILE } from '../support/replay-world.ts';

const CONFIG = 'config/config.env';
const ANCHORS = ['Add a cart to the shop', 'Use SQLite for it, no server', 'also add totals', 'open a merge request', 'can guests keep their basket?', 'cookie is fine'];
const TEXTS = ['Cart must stay in SQLite', 'Never add a server for carts', 'Pick the basket storage', 'Keep carts in SQLite', 'Wrote src/cart.ts model', 'Added totals in src/totals.ts', 'Opened !34 for feat/cart'];
const SIX_TURNS: readonly (readonly Record<string, unknown>[])[] = [
    [{ op: 'add', anchor: ANCHORS[0], section: 'goal', text: TEXTS[0] }, { op: 'add', anchor: ANCHORS[0], section: 'rules', text: TEXTS[1] }],
    [{ op: 'add', anchor: ANCHORS[1], section: 'needs', text: TEXTS[2] }, { op: 'add', anchor: ANCHORS[1], section: 'decisions', text: TEXTS[3], why: 'no server is needed' }],
    [{ op: 'add', anchor: ANCHORS[2], section: 'done', text: TEXTS[4] }],
    [{ op: 'add', anchor: ANCHORS[3], section: 'done', text: TEXTS[5] }],
    [{ op: 'add', anchor: ANCHORS[4], section: 'done', text: TEXTS[6] }],
    [],
];
const EXPLAINS = /cannot see or change.*Never add a fact that repeats one of them/;

const row = (type: string, at: string, content: unknown): string => JSON.stringify({ type, timestamp: at, message: { content } });
const SPREAD = [
    row('user', '2026-10-07T09:00:00.000Z', 'Plan the uploader release'),
    row('assistant', '2026-10-07T09:01:00.000Z', [{ type: 'text', text: 'Next I tag the uploader release.' }]),
    row('user', '2026-10-07T12:00:00.000Z', 'Add totals to the cart'),
    row('assistant', '2026-10-07T12:01:00.000Z', [{ type: 'text', text: 'Added totals in src/totals.ts.' }]),
    row('user', '2026-10-07T14:00:00.000Z', 'Check the cart tests'),
    row('assistant', '2026-10-07T14:01:00.000Z', [{ type: 'text', text: 'The cart tests pass.' }]),
].join('\n') + '\n';

const view = (...lines: readonly string[]): unknown => {
    const settings = backendsWorld();
    try {
        settings.write(`${lines.join('\n')}\n`);
        return loadSettings().writerView;
    } finally {
        settings.close();
    }
};

const settingsOf = (...lines: readonly string[]): ReturnType<typeof loadSettings> => {
    const settings = backendsWorld();
    try {
        settings.write(`${lines.join('\n')}\n`);
        return loadSettings();
    } finally {
        settings.close();
    }
};

const add = (anchor: string | undefined, section: string, text: string): Record<string, unknown> => ({ op: 'add', anchor, section, text });

const writing = (world: EvalWorld, ops: readonly (readonly Record<string, unknown>[])[]): void => {
    world.forget();
    ops.forEach((each, at) => { world.answer(`writer.${at + 1}`, JSON.stringify({ ops: each })); });
};

describe('six turns of facts grow past a view that keeps the newest two', () => {
    let world: EvalWorld;
    let pruned = { code: 0 as number | null, stdout: '', stderr: '' };

    const sixAdds = (): void => {
        writing(world, SIX_TURNS);
    };

    before(async () => {
        world = judgingWorld();
        world.write(CONFIG, 'TAB_RECAP_WRITER_KEEP_NEWEST=2\n');
        sixAdds();
        pruned = await world.run(['eval', '--replay', FILE, '--pipeline', 'one', '--prune']);
    });

    after(() => {
        world.close();
    });

    test('the report names the pruned view, and the ledger still holds all six facts', () => {
        assert.equal(pruned.code, 0, pruned.stderr);
        assert.match(pruned.stdout, /^view pruned ·/);
        assert.match(pruned.stdout, /6 turns: 7 facts, 7 open, 0 closed/);
        for (const text of TEXTS) {
            assert.ok(pruned.stdout.includes(text), text);
        }
    });

    test('the writer sees every goal, rule, need and decision, only the newest two done facts, and how many it cannot see', () => {
        const last = world.seen('writer', 6);
        assert.match(last, / <hidden section="done" count="1"\/>/);
        for (const [at, section] of [[0, 'goal'], [1, 'rules'], [2, 'needs'], [3, 'decisions']] as const) {
            assert.ok(last.includes(`section="${section}"`) && last.includes(TEXTS[at] ?? ''), section);
        }
        assert.ok(!last.includes(TEXTS[4] ?? ''), 'the oldest done fact is out of its view');
        assert.ok(last.includes(TEXTS[5] ?? '') && last.includes(TEXTS[6] ?? ''));
        assert.equal(world.seen('writer', 4).includes('<hidden'), false, 'nothing is hidden while the view is not yet full');
    });

    test('the instructions tell the writer about hidden facts when the view hides some', () => {
        assert.match(world.seen('writer', 6).replaceAll('\n', ' '), EXPLAINS);
    });

    test('the same replay without --prune shows every fact and says nothing about hidden ones', { timeout: 30_000 }, async () => {
        sixAdds();
        const full = await world.run(['eval', '--replay', FILE, '--pipeline', 'one']);
        assert.equal(full.code, 0, full.stderr);
        assert.match(full.stdout, /^view full ·/);
        const last = world.seen('writer', 6);
        assert.equal(last.includes('<hidden'), false);
        assert.doesNotMatch(last.replaceAll('\n', ' '), EXPLAINS);
        for (const text of TEXTS) {
            assert.ok(last.includes(text), text);
        }
    });

    test('an add that repeats a fact hidden from the writer is refused as a duplicate and sent back', { timeout: 30_000 }, async () => {
        writing(world, [...SIX_TURNS.slice(0, 5), [{ op: 'add', anchor: ANCHORS[5], section: 'done', text: TEXTS[4] }], []]);
        const ran = await world.run(['eval', '--replay', FILE, '--pipeline', 'one', '--prune']);
        assert.equal(ran.code, 0, ran.stderr);
        assert.match(ran.stdout, /6 turns: 7 facts, 7 open, 0 closed/);
        assert.match(world.seen('writer', 7), /already recorded and hidden \("Wrote src\/cart\.ts model"\): drop the add/);
        assert.match(ran.stdout, /G2 +1 refused/);
    });

    test('a count outside 1 to 50 falls back to 10 rather than to the nearest edge, and 1 is taken', { timeout: 60_000 }, async () => {
        for (const [value, hidden] of [['51', 0], ['0', 0], ['1.5', 0], ['1', 2]] as const) {
            world.write(CONFIG, `TAB_RECAP_WRITER_KEEP_NEWEST=${value}\n`);
            sixAdds();
            const ran = await world.run(['eval', '--replay', FILE, '--pipeline', 'one', '--prune']);
            assert.equal(ran.code, 0, ran.stderr);
            const doc = world.seen('writer', 6);
            assert.equal(/<hidden section="done" count="(\d+)"/.exec(doc)?.[1] ?? '0', String(hidden), value);
        }
    });
});

describe('the numbering skips what the view hides and gives every closed fact an id', () => {
    let world: EvalWorld;
    let last = '';

    before(async () => {
        world = judgingWorld();
        world.write(CONFIG, 'TAB_RECAP_WRITER_KEEP_NEWEST=2\n');
        writing(world, [
            [add(ANCHORS[0], 'goal', 'Probe goal'), add(ANCHORS[0], 'now', 'Probe now one'), add(ANCHORS[0], 'needs', 'Probe need one'), add(ANCHORS[0], 'links', 'Probe link zero'), add(ANCHORS[0], 'links', 'Probe link one'), add(ANCHORS[0], 'links', 'Probe link two')],
            [add(ANCHORS[1], 'done', 'Probe done zero'), add(ANCHORS[1], 'done', 'Probe done one'), add(ANCHORS[1], 'done', 'Probe done two'), add(ANCHORS[1], 'needs', 'Probe need two'), add(ANCHORS[1], 'needs', 'Probe need three'), add(ANCHORS[1], 'needs', 'Probe need four')],
            [{ op: 'close', id: 'f2', why: 'answered' }],
            [], [], [],
        ]);
        const ran = await world.run(['eval', '--replay', FILE, '--pipeline', 'one', '--prune']);
        assert.equal(ran.code, 0, ran.stderr);
        last = world.seen('writer', 5);
    });

    after(() => {
        world.close();
    });

    test('links are cut to the newest, every need stays, and the hidden ones are counted', () => {
        assert.match(last, / <hidden section="links" count="1"\/>/);
        assert.match(last, / <hidden section="done" count="1"\/>/);
        assert.doesNotMatch(last, /<hidden section="(needs|now|goal)"/);
        for (const text of ['Probe link one', 'Probe link two', 'Probe done one', 'Probe done two', 'Probe goal', 'Probe need two', 'Probe need three', 'Probe need four']) {
            assert.ok(last.includes(`>${text}</fact>`), text);
        }
        assert.ok(!last.includes('Probe link zero') && !last.includes('Probe done zero'), 'the oldest of each is out of its view');
    });

    test('a hidden fact takes no id, a closed fact takes the next one after the shown', () => {
        const ids = [...last.matchAll(/<fact id="f(\d+)"/g)].map((found) => Number(found[1]));
        assert.deepEqual(ids, Array.from({ length: 10 }, (_, at) => at + 1));
        const closed = [...last.matchAll(/<fact id="f(\d+)"[^>]*state="closed"[^>]*>([^<]*)</g)].map((found) => [Number(found[1]), found[2]]);
        assert.deepEqual(closed, [[9, 'Probe now one'], [10, 'Probe need one']]);
    });
});

describe('the daemon reads the view from the settings on every run', () => {
    test('the view is full unless pruning is switched on', () => {
        assert.deepEqual(view(), { kind: 'full' });
        assert.deepEqual(view('TAB_RECAP_WRITER_PRUNE=yes'), { kind: 'full' });
        assert.deepEqual(view('TAB_RECAP_WRITER_PRUNE=on', 'TAB_RECAP_WRITER_KEEP_NEWEST=4', 'TAB_RECAP_WRITER_NEXT_HOURS=48'), { kind: 'pruned', keepNewest: 4, nextHours: 48 });
    });

    test('the pruned view the settings screen offers is 10 and 24 while pruning is off, and takes the keys once they are set', () => {
        assert.deepEqual(settingsOf().writerViewSettings, { kind: 'pruned', keepNewest: 10, nextHours: 24 });
        assert.deepEqual(settingsOf('TAB_RECAP_WRITER_PRUNE=yes', 'TAB_RECAP_WRITER_KEEP_NEWEST=51').writerViewSettings, { kind: 'pruned', keepNewest: 10, nextHours: 24 });
        assert.deepEqual(settingsOf('TAB_RECAP_WRITER_KEEP_NEWEST=3', 'TAB_RECAP_WRITER_NEXT_HOURS=6').writerViewSettings, { kind: 'pruned', keepNewest: 3, nextHours: 6 });
    });

    test('a count or a window outside its range falls back to 10 and 24', () => {
        assert.deepEqual(view('TAB_RECAP_WRITER_PRUNE=on', 'TAB_RECAP_WRITER_KEEP_NEWEST=51', 'TAB_RECAP_WRITER_NEXT_HOURS=0'), { kind: 'pruned', keepNewest: 10, nextHours: 24 });
    });
});

describe('a next fact ages out of the view by hours', () => {
    let world: EvalWorld;
    let file = '';

    const ran = async (hours: string): Promise<{ readonly doc: string; readonly stdout: string }> => {
        world.write(CONFIG, `TAB_RECAP_WRITER_NEXT_HOURS=${hours}\n`);
        writing(world, [[{ op: 'add', anchor: 'Plan the uploader release', section: 'next', text: 'Tag the uploader release' }], [{ op: 'add', anchor: 'Add totals to the cart', section: 'done', text: 'Added totals in src/totals.ts' }], []]);
        const done = await world.run(['eval', '--replay', file, '--pipeline', 'one', '--prune']);
        assert.equal(done.code, 0, done.stderr);
        return { doc: world.seen('writer', 3), stdout: done.stdout };
    };

    before(() => {
        world = judgingWorld();
        file = world.write('transcripts/spread.jsonl', SPREAD);
    });

    after(() => {
        world.close();
    });

    test('five hours on, a next fact is out of a four-hour window, counted, and still in the ledger', { timeout: 30_000 }, async () => {
        const { doc, stdout } = await ran('4');
        assert.match(doc, / <hidden section="next" count="1"\/>/);
        assert.equal(doc.includes('Tag the uploader release'), false);
        assert.ok(stdout.includes('Tag the uploader release'));
    });

    test('a fact exactly at the limit is still shown', { timeout: 30_000 }, async () => {
        const { doc } = await ran('5');
        assert.equal(doc.includes('<hidden'), false);
        assert.ok(doc.includes('Tag the uploader release'));
    });

    test('a window outside 1 to 720 hours falls back to 24', { timeout: 60_000 }, async () => {
        for (const hours of ['0', '721', '2.5']) {
            const { doc } = await ran(hours);
            assert.equal(doc.includes('<hidden'), false, hours);
            assert.ok(doc.includes('Tag the uploader release'), hours);
        }
    });
});
