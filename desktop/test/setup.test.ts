import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { must } from '../src/kernel/result.ts';
import { duration } from '../src/kernel/time.ts';
import { parseNonEmptyText } from '../src/kernel/text.ts';
import { parseHcParams } from '../src/hc-core/wire.ts';
import { FAST_LINK, openWorld, setupTest } from './support/setup-test.ts';

const LIST = must(parseNonEmptyText('terminal.list'));
const NOTHING = must(parseHcParams({}));
const SECOND = duration(1000);

test('setupTest gives a running fake core and a link that talks to it', async (t) => {
    const world = await setupTest(t);
    const answer = await world.link().call(LIST, NOTHING, SECOND);
    assert.equal(answer.kind, 'answer');
    assert.deepEqual(world.core.seen.map((seen) => seen.method), ['hello', 'terminal.list']);
});

test('every link and event stream made through the world is closed with it, and the socket is gone', async () => {
    const world = await openWorld();
    const link = world.link(FAST_LINK);
    const stream = world.events();
    assert.equal((await link.call(LIST, NOTHING, SECOND)).kind, 'answer');
    stream.start();
    const feed = stream.feed[Symbol.asyncIterator]();
    const first = await feed.next();
    assert.equal(first.done, false);
    await world.close();
    assert.equal(existsSync(world.path), false);
    const after = await link.call(LIST, NOTHING, SECOND);
    assert.equal(after.kind, 'unknown');
});

test('two worlds do not share a socket', async (t) => {
    const first = await setupTest(t);
    const second = await setupTest(t);
    assert.notEqual(first.path, second.path);
    assert.equal((await first.link().call(LIST, NOTHING, SECOND)).kind, 'answer');
    assert.deepEqual(second.core.seen, []);
});
