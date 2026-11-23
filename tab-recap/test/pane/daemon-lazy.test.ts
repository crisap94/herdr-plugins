import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeOutput } from '@stateforge-labs/harness-adapters/testing';
import { lazyRuntime, RuntimeLoadError } from '#src/adapters/harness/library.ts';
import type { RuntimeLoader } from '#src/adapters/harness/library.ts';
import { fakeRuntime } from '#test/fakes/harness-runtime.ts';

interface Counted {
    readonly loader: RuntimeLoader;
    readonly loads: () => number;
    readonly runtime: ReturnType<typeof fakeRuntime>;
}

function countedLoader(): Counted {
    const runtime = fakeRuntime({ scripts: { claude: [fakeOutput({ text: 'ok' })] }, promptLimits: { claude: 4242 } });
    let loads = 0;
    return { loader: () => { loads += 1; return { createRuntime: () => runtime }; }, loads: () => loads, runtime };
}

test('building the lazy runtime loads nothing', () => {
    const counted = countedLoader();
    lazyRuntime(counted.loader);
    assert.equal(counted.loads(), 0);
});

test('the four members delegate to the runtime the loader made, and one load serves many calls', () => {
    const counted = countedLoader();
    const lazy = lazyRuntime(counted.loader);
    assert.equal(lazy.promptLimit('claude'), 4242);
    assert.equal(lazy.capabilities('claude'), counted.runtime.capabilities('claude'));
    assert.equal(lazy.policyNotice('claude', 'login-store')?.harness, 'claude');
    assert.equal(lazy.policyNotice('codex', 'login-store'), null);
    const handle = lazy.headless('claude', { credential: { mode: 'login-store', acknowledgePolicy: true } });
    assert.equal(typeof handle.run, 'function');
    assert.equal(counted.runtime.calls.length, 0);
    assert.equal(counted.loads(), 1);
});

test('a throwing loader throws RuntimeLoadError with its message on every use, and recovers once it stops', () => {
    let failing = true;
    const counted = countedLoader();
    const lazy = lazyRuntime(() => {
        if (failing) throw new Error('Cannot find module the runtime');
        return counted.loader();
    });
    for (const use of [(): unknown => lazy.promptLimit('claude'), (): unknown => lazy.capabilities('claude'), (): unknown => lazy.policyNotice('claude', 'login-store'), (): unknown => lazy.headless('claude', { credential: { mode: 'login-store', acknowledgePolicy: true } })]) {
        assert.throws(use, (error: unknown) => error instanceof RuntimeLoadError && error.message === 'Cannot find module the runtime');
    }
    failing = false;
    assert.equal(lazy.promptLimit('claude'), 4242);
    assert.equal(counted.loads(), 1);
});

test('a runtime that fails to be created is a load failure too, and is not remembered', () => {
    let attempts = 0;
    const counted = countedLoader();
    const lazy = lazyRuntime(() => ({ createRuntime: (): typeof counted.runtime => { attempts += 1; if (attempts === 1) throw new Error('boom'); return counted.runtime; } }));
    assert.throws((): unknown => lazy.promptLimit('claude'), RuntimeLoadError);
    assert.equal(lazy.promptLimit('claude'), 4242);
    assert.equal(attempts, 2);
});
