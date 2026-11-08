import { test } from 'node:test';
import assert from 'node:assert/strict';
import { must } from '#src/protocol/result.ts';
import { duration } from '#src/recap/domain/time.ts';
import { parseNonEmptyText, type NonEmptyText } from '#src/recap/domain/text.ts';
import { parseHcParams } from '#src/adapters/hc-core-wire.ts';
import { CoreLink } from '#src/adapters/hc-core-link.ts';
import type { HcParams } from '#src/adapters/hc-core-wire.ts';
import type { CoreLinkTiming, HcCallResult } from '#src/adapters/hc-core-link.ts';
import { FakeHcCore, later } from './fakes/hc-core.ts';

const name = (text: string): NonEmptyText => must(parseNonEmptyText(text));
const FAST: CoreLinkTiming = { helloTimeout: duration(300), backoffBase: duration(40), backoffCap: duration(160) };
const SECOND = duration(1000);
const params = (fields: object): HcParams => must(parseHcParams(fields));

async function withLink(run: (core: FakeHcCore, link: CoreLink) => Promise<void>, timing: CoreLinkTiming = FAST): Promise<void> {
    const core = await FakeHcCore.start();
    const link = new CoreLink({ path: core.path, timing });
    try {
        await run(core, link);
    } finally {
        await link.close();
        await core.stop();
    }
}

const whyOf = (result: HcCallResult): string => (result.kind === 'unknown' ? result.why.why : result.kind);

test('the first call connects, says hello at generation 1 and remembers the version and the methods', async () => {
    await withLink(async (core, link) => {
        const result = await link.call(name('terminal.list'), params({}), SECOND);
        assert.equal(result.kind, 'answer');
        assert.ok(link.hello !== null);
        assert.equal(link.hello.version, '0.1.18');
        assert.equal(link.hello.methods.length, 32);
        assert.deepEqual(core.seen.map((seen) => seen.method), ['hello', 'terminal.list']);
        assert.deepEqual(core.seen[0]?.params, { generation: 1 });
    });
});

test('one connection carries every call', async () => {
    await withLink(async (core, link) => {
        for (const address of ['t1', 't2', 't1']) {
            assert.equal((await link.call(name('terminal.get'), params({ terminal: address }), SECOND)).kind, 'answer');
        }
        assert.equal(core.connections, 1);
    });
});

test('calls are pipelined and each reply reaches its own caller even out of order', async () => {
    await withLink(async (core, link) => {
        await link.open();
        core.delay('terminal.list', 120);
        const order: string[] = [];
        const slow = link.call(name('terminal.list'), params({}), SECOND).then((result) => { order.push('list'); return result; });
        const quick = link.call(name('terminal.get'), params({ terminal: 't2' }), SECOND).then((result) => { order.push('get'); return result; });
        const read = link.call(name('terminal.read'), params({ terminal: 't1' }), SECOND).then((result) => { order.push('read'); return result; });
        const [listed, got, screen] = await Promise.all([slow, quick, read]);
        assert.deepEqual(order.slice(0, 2).toSorted(), ['get', 'read']);
        assert.equal(order[2], 'list');
        assert.ok(listed.kind === 'answer' && got.kind === 'answer' && screen.kind === 'answer');
        assert.match(JSON.stringify(got.value), /"address":"t2"/);
        assert.match(JSON.stringify(screen.value), /screen of t1/);
        assert.match(JSON.stringify(listed.value), /hidden_finished/);
    });
});

test('a reply that takes seconds-like time is waited for when the timeout allows it', async () => {
    await withLink(async (core, link) => {
        core.delay('terminal.get', 250);
        const result = await link.call(name('terminal.get'), params({ terminal: 't1' }), SECOND);
        assert.equal(result.kind, 'answer');
    });
});

test('a call that outlasts its timeout is an Unknown timeout, the late reply is ignored and the link still works', async () => {
    await withLink(async (core, link) => {
        core.delay('terminal.get', 200);
        const result = await link.call(name('terminal.get'), params({ terminal: 't1' }), duration(60));
        assert.ok(result.kind === 'unknown' && result.why.why === 'timeout');
        await later(220);
        core.delay('terminal.get', 0);
        assert.equal((await link.call(name('terminal.get'), params({ terminal: 't2' }), SECOND)).kind, 'answer');
        assert.equal(core.connections, 1);
    });
});

test('a silent core that accepts and never answers times the hello out and the call fails with a timeout', async () => {
    await withLink(async (core, link) => {
        core.silent = true;
        const result = await link.call(name('terminal.list'), params({}), duration(80));
        assert.equal(whyOf(result), 'timeout');
    });
});

test('an error reply becomes failed with its JSON-RPC code and data.kind', async () => {
    await withLink(async (_core, link) => {
        const missing = await link.call(name('terminal.get'), params({ terminal: 't99' }), SECOND);
        assert.ok(missing.kind === 'unknown' && missing.why.why === 'failed');
        assert.equal(missing.why.code, -32000);
        assert.match(missing.why.detail, /^not_found: no terminal "t99"/);
        const unknownMethod = await link.call(name('nothing.here'), params({}), SECOND);
        assert.ok(unknownMethod.kind === 'unknown' && unknownMethod.why.why === 'failed');
        assert.equal(unknownMethod.why.code, -32601);
        assert.match(unknownMethod.why.detail, /^method_not_found/);
    });
});

test('a reply split over two writes is still one answer', async () => {
    await withLink(async (core, link) => {
        core.splitReplies = true;
        assert.equal((await link.call(name('terminal.get'), params({ terminal: 't1' }), SECOND)).kind, 'answer');
    });
});

test('a hello at another generation is refused as unreadable', async () => {
    await withLink(async (core, link) => {
        core.hello({ generation: 2 });
        const result = await link.call(name('terminal.list'), params({}), SECOND);
        assert.ok(result.kind === 'unknown' && result.why.why === 'unreadable');
        assert.match(result.why.detail, /generation 2/);
        assert.equal(link.hello, null);
    });
});

test('garbage lines from the core are skipped', async () => {
    await withLink(async (core, link) => {
        await link.open();
        core.raw('not json\n');
        assert.equal((await link.call(name('terminal.get'), params({ terminal: 't1' }), SECOND)).kind, 'answer');
    });
});

test('with no core the call is unreachable, and a call made while the link backs off fails fast', async () => {
    const core = FakeHcCore.unlistened();
    const link = new CoreLink({ path: core.path, timing: { helloTimeout: duration(300), backoffBase: duration(300), backoffCap: duration(300) } });
    try {
        const first = await link.call(name('terminal.list'), params({}), SECOND);
        assert.equal(whyOf(first), 'unreachable');
        const started = Date.now();
        const second = await link.call(name('terminal.list'), params({}), duration(5000));
        assert.equal(whyOf(second), 'unreachable');
        assert.ok(Date.now() - started < 100);
    } finally {
        await link.close();
        await core.stop();
    }
});

test('a drop fails the calls in flight as unreachable, then the link reconnects by itself and works again', async () => {
    await withLink(async (core, link) => {
        await link.open();
        core.delay('terminal.get', 400);
        const inFlight = link.call(name('terminal.get'), params({ terminal: 't1' }), SECOND);
        await later(30);
        core.dropAll();
        assert.equal(whyOf(await inFlight), 'unreachable');
        core.delay('terminal.get', 0);
        await later(10);
        assert.equal(whyOf(await link.call(name('terminal.get'), params({ terminal: 't1' }), SECOND)), 'unreachable');
        await later(120);
        assert.equal((await link.call(name('terminal.get'), params({ terminal: 't1' }), SECOND)).kind, 'answer');
        assert.equal(core.connections, 2);
    });
});

test('a core that was down and comes back is reached by the backoff', async () => {
    const core = FakeHcCore.unlistened();
    const link = new CoreLink({ path: core.path, timing: FAST });
    try {
        assert.equal(whyOf(await link.call(name('terminal.list'), params({}), SECOND)), 'unreachable');
        await core.up();
        await later(450);
        const result = await link.call(name('terminal.list'), params({}), SECOND);
        assert.equal(result.kind, 'answer');
        assert.equal(core.connections, 1);
    } finally {
        await link.close();
        await core.stop();
    }
});

test('close settles what is in flight, refuses later calls, ends the socket and never reconnects', async () => {
    await withLink(async (core, link) => {
        await link.open();
        core.delay('terminal.get', 300);
        const inFlight = link.call(name('terminal.get'), params({ terminal: 't1' }), SECOND);
        await later(20);
        await link.close();
        assert.equal(whyOf(await inFlight), 'unreachable');
        assert.equal(whyOf(await link.call(name('terminal.list'), params({}), SECOND)), 'unreachable');
        await later(100);
        assert.equal(core.open, 0);
        assert.equal(core.connections, 1);
    });
});
