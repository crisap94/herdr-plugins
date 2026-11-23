import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeOutput } from '@stateforge-labs/harness-adapters/testing';
import { lazyRuntime, RuntimeLoadError } from '#src/adapters/harness/library.ts';
import type { RuntimeLoader } from '#src/adapters/harness/library.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Backends } from '#src/daemon/backends.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { HarnessDirectory } from '#src/ports/harnesses.ts';
import { agentKind } from '#test/support/ids.ts';
import { requestOf } from '#test/support.ts';
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

interface Wired {
    readonly backends: Backends;
    readonly lines: string[];
}

const ENV_KEYS = ['HERDR_PLUGIN_CONFIG_DIR', 'HOME', 'TAB_RECAP_BACKEND', 'TAB_RECAP_CUSTOM_CMD', 'TAB_RECAP_CLAUDE_POLICY_ACK'];

async function withBackends(backend: string, runtime: ReturnType<typeof lazyRuntime>, body: (wired: Wired) => Promise<void>): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), 'daemon-lazy-'));
    const was = ENV_KEYS.map((key) => process.env[key]);
    Object.assign(process.env, { HERDR_PLUGIN_CONFIG_DIR: dir, HOME: dir, TAB_RECAP_BACKEND: backend, TAB_RECAP_CUSTOM_CMD: 'my-llm', TAB_RECAP_CLAUDE_POLICY_ACK: 'on' });
    const lines: string[] = [];
    const listing = (): HarnessDirectory => ({ available: () => Promise.resolve({ kind: 'available', ids: [agentKind(backend)] }) });
    try {
        const backends = new Backends(must(parseDirectory(dir)), { herdr: listing(), path: listing() }, { notify: (): Promise<{ kind: 'shown' }> => Promise.resolve({ kind: 'shown' }) }, (line) => { lines.push(line); }, runtime);
        await backends.refresh();
        await body({ backends, lines });
    } finally {
        ENV_KEYS.forEach((key, at) => { const before = was[at]; if (before === undefined) { delete process.env[key]; } else { process.env[key] = before; } });
        rmSync(dir, { recursive: true, force: true });
    }
}

const REASON = 'harness runtime did not load: Cannot find module the runtime';

test('a runtime that does not load leaves the daemon up: every Backends method answers as with no backend, and says why once', async () => {
    let failing: Error | null = new Error('Cannot find module the runtime');
    const counted = countedLoader();
    await withBackends('claude', lazyRuntime(() => { if (failing !== null) throw failing; return counted.loader(); }), async ({ backends, lines }) => {
        assert.deepEqual(lines, []);
        for (let round = 0; round < 2; round += 1) {
            assert.equal(backends.brief(), null);
            assert.equal(backends.decider(), null);
            assert.equal(backends.coverageDecider(), null);
            assert.equal(backends.curator(), null);
            assert.equal(backends.enumerator(), null);
            const written = await backends.summarizer().write(requestOf());
            assert.deepEqual([backends.summarizer().backend, written], ['none', { kind: 'unknown', why: { why: 'not-found', what: REASON } }]);
        }
        assert.deepEqual(lines, [REASON]);
        failing = new Error('another reason');
        assert.equal(backends.brief(), null);
        assert.deepEqual(lines, [REASON, 'harness runtime did not load: another reason']);
        failing = null;
        assert.notEqual(backends.brief(), null);
        assert.notEqual(backends.curator(), null);
        assert.equal(backends.summarizer().backend, 'claude/haiku');
        assert.equal(counted.loads(), 1);
    });
});

test('the custom backend never loads the runtime', async () => {
    let loads = 0;
    await withBackends('custom', lazyRuntime(() => { loads += 1; throw new Error('must not load'); }), async ({ backends, lines }) => {
        assert.notEqual(backends.summarizer().backend, 'none');
        assert.notEqual(backends.brief(), null);
        assert.notEqual(backends.curator(), null);
        assert.equal(backends.enumerator(), null);
        assert.equal(loads, 0);
        assert.deepEqual(lines, []);
    });
});
