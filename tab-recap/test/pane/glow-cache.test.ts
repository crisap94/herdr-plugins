import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glowCache, type GlowSpawn } from '#src/daemon/view/glow-cache.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

interface Run {
    readonly args: readonly Text[];
    readonly input: Text;
    readonly output: Promise<Text | null>;
    finish(output: Text | null): void;
    fail(): void;
}

const fakeSpawn = (): { readonly spawn: GlowSpawn; readonly runs: Run[] } => {
    const runs: Run[] = [];
    const spawn: GlowSpawn = (args, input) => {
        let finish!: (output: Text | null) => void;
        let fail!: () => void;
        const output = new Promise<Text | null>((resolve, reject) => {
            finish = resolve;
            fail = (): void => {
                reject(new Error('glow refused'));
            };
        });
        runs.push({ args, input, output, finish, fail });
        return output;
    };
    return { spawn, runs };
};

const text = (raw: string): Text => must(parseText(raw));
const width = (raw: number): Count => must(parseCount(raw));

test('a miss returns null and starts exactly one run with the glow arguments', (): void => {
    const { spawn, runs } = fakeSpawn();
    const cache = glowCache(spawn);

    assert.equal(cache.render(text('# hi'), width(40)), null);
    assert.equal(cache.render(text('# hi'), width(40)), null);

    assert.equal(runs.length, 1);
    assert.deepEqual(runs.at(0)?.args, ['-s', 'dark', '-w', '40', '-']);
    assert.equal(runs.at(0)?.input, '# hi');
});

test('a narrow width is clamped to the glow minimum', (): void => {
    const { spawn, runs } = fakeSpawn();
    const cache = glowCache(spawn);

    cache.render(text('x'), width(5));

    assert.deepEqual(runs.at(0)?.args, ['-s', 'dark', '-w', '20', '-']);
});

test('a finished run is cached, lines split without the trailing newlines', async (): Promise<void> => {
    const { spawn, runs } = fakeSpawn();
    const cache = glowCache(spawn);

    cache.render(text('doc'), width(40));
    runs.at(0)?.finish(text('first\nsecond\n\n'));
    await runs.at(0)?.output;

    assert.deepEqual(cache.render(text('doc'), width(40)), ['first', 'second']);
    assert.equal(runs.length, 1);
});

test('the same text at another width is a separate run', (): void => {
    const { spawn, runs } = fakeSpawn();
    const cache = glowCache(spawn);

    cache.render(text('doc'), width(40));
    cache.render(text('doc'), width(60));

    assert.equal(runs.length, 2);
    assert.deepEqual(runs.at(1)?.args, ['-s', 'dark', '-w', '60', '-']);
});

test('onReady fires once per finished run and not on a cache hit', async (): Promise<void> => {
    const { spawn, runs } = fakeSpawn();
    const cache = glowCache(spawn);
    let fired = 0;
    cache.onReady((): void => {
        fired += 1;
    });

    cache.render(text('doc'), width(40));
    assert.equal(fired, 0);
    runs.at(0)?.finish(text('done'));
    await runs.at(0)?.output;
    assert.equal(fired, 1);

    cache.render(text('doc'), width(40));
    assert.equal(fired, 1);
});

test('an unsubscribed listener is not called', async (): Promise<void> => {
    const { spawn, runs } = fakeSpawn();
    const cache = glowCache(spawn);
    let fired = 0;
    const unsubscribe = cache.onReady((): void => {
        fired += 1;
    });
    unsubscribe();

    cache.render(text('doc'), width(40));
    runs.at(0)?.finish(text('done'));
    await runs.at(0)?.output;

    assert.equal(fired, 0);
});

test('the cache holds at most its limit and evicts the least recently used', async (): Promise<void> => {
    const { spawn, runs } = fakeSpawn();
    const cache = glowCache(spawn, width(2));

    for (const name of ['a', 'b', 'c']) {
        cache.render(text(name), width(40));
    }
    for (const run of runs) {
        run.finish(text(`lines of ${run.input}`));
        await run.output;
    }

    assert.equal(cache.render(text('a'), width(40)), null);
    assert.equal(runs.length, 4);
    assert.deepEqual(cache.render(text('b'), width(40)), ['lines of b']);
    assert.deepEqual(cache.render(text('c'), width(40)), ['lines of c']);
    assert.equal(runs.length, 4);
});

test('a hit refreshes recency so the untouched entry is evicted instead', async (): Promise<void> => {
    const { spawn, runs } = fakeSpawn();
    const cache = glowCache(spawn, width(2));

    for (const name of ['a', 'b']) {
        cache.render(text(name), width(40));
        runs.at(-1)?.finish(text(`lines of ${name}`));
        await runs.at(-1)?.output;
    }
    assert.deepEqual(cache.render(text('a'), width(40)), ['lines of a']);

    cache.render(text('c'), width(40));
    runs.at(-1)?.finish(text('lines of c'));
    await runs.at(-1)?.output;

    assert.deepEqual(cache.render(text('a'), width(40)), ['lines of a']);
    assert.equal(cache.render(text('b'), width(40)), null);
});

test('a failed spawn caches nothing, notifies nobody and the next render retries', async (): Promise<void> => {
    const { spawn, runs } = fakeSpawn();
    const cache = glowCache(spawn);
    let fired = 0;
    cache.onReady((): void => {
        fired += 1;
    });

    cache.render(text('doc'), width(40));
    runs.at(0)?.finish(null);
    await runs.at(0)?.output;

    assert.equal(fired, 0);
    assert.equal(cache.render(text('doc'), width(40)), null);
    assert.equal(runs.length, 2);
});

test('a rejected spawn caches nothing and the next render retries', async (): Promise<void> => {
    const { spawn, runs } = fakeSpawn();
    const cache = glowCache(spawn);

    cache.render(text('doc'), width(40));
    runs.at(0)?.fail();
    await runs.at(0)?.output.catch((): void => undefined);

    assert.equal(cache.render(text('doc'), width(40)), null);
    assert.equal(runs.length, 2);
});
