import { requestOf } from '#test/support.ts';
import { kindOf } from '#test/fakes/agent-kind.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirsOf, PathHarnessDirectory, presenceOnPath } from '#src/adapters/harness/on-path.ts';
import { Backends, intersect, pick } from '#src/daemon/backends.ts';
import { backendFrom, modelsFrom, type BackendChoice } from '#src/daemon/config.ts';
import type { HarnessList } from '#src/ports/harnesses.ts';
import { unknown } from '@stateforge-labs/session-ledger';
import { fakeRuntime } from '#test/fakes/harness-runtime.ts';
import { causeOf } from './fakes/cause.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseDirectory } from '@stateforge-labs/session-ledger';
import { agentKind } from '#test/support/ids.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';

const found = (...ids: string[]): HarnessList => ({ kind: 'available', ids: ids.map((id) => agentKind(id)) });
const get = (values: Record<string, string>) => (key: string): Text | undefined => (values[key] === undefined ? undefined : textOf(values[key]));
const backendOf = (raw: string | undefined): BackendChoice => backendFrom(raw === undefined ? undefined : textOf(raw));
const modelsOf = modelsFrom;
const down = unknown({ why: 'unreachable', detail: causeOf('no socket') });

test('auto: the first of claude → codex → opencode that is available; a named one is taken as named', () => {
    assert.equal(pick('auto', [textOf('opencode'), textOf('codex')]), 'codex');
    assert.equal(pick('auto', [textOf('opencode')]), 'opencode');
    assert.equal(pick('auto', [textOf('pi'), textOf('custom')]), null);
    assert.equal(pick('auto', []), null);
    assert.equal(pick('opencode', []), 'opencode');
});

test('availability is herdr ∩ PATH; the PATH alone when herdr cannot be asked; herdr alone if the PATH cannot', () => {
    assert.deepEqual(intersect(found('claude', 'codex'), found('codex', 'opencode')), found('codex'));
    assert.deepEqual(intersect(down, found('opencode')), found('opencode'));
    assert.deepEqual(intersect(found('claude'), down), found('claude'));
});

test('PathHarnessDirectory: only executables that resolve on PATH', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-path-'));
    const before = process.env['PATH'];
    try {
        writeFileSync(join(dir, 'opencode'), '#!/bin/sh\n');
        chmodSync(join(dir, 'opencode'), 0o755);
        writeFileSync(join(dir, 'codex'), 'not executable');
        process.env['PATH'] = dir;
        assert.deepEqual(await new PathHarnessDirectory([kindOf('claude'), kindOf('codex'), kindOf('opencode')]).available(), found('opencode'));
        assert.equal(presenceOnPath(kindOf('opencode'), dirsOf(textOf(dir))), 'present');
        assert.equal(presenceOnPath(kindOf('claude'), dirsOf(textOf(dir))), 'absent');
    } finally {
        process.env['PATH'] = before;
        rmSync(dir, { recursive: true });
    }
});

test('models: own key, then legacy keys; the legacy generic model only for the backend named', () => {
    assert.equal(backendOf(undefined), 'auto');
    assert.equal(backendOf('nonsense'), 'auto');
    assert.equal(backendOf('opencode'), 'opencode');
    const operator = modelsOf(get({ TAB_RECAP_BACKEND: 'codex', TAB_RECAP_CODEX_MODEL: 'gpt-6-luna' }), 'codex');
    assert.equal(operator.codex, 'gpt-6-luna');
    assert.equal(operator.claude, '');
    const newer = modelsOf(get({ TAB_RECAP_MODEL_CODEX: 'new', TAB_RECAP_CODEX_MODEL: 'old' }), 'codex');
    assert.equal(newer.codex, 'new');
    assert.equal(modelsOf(get({ TAB_RECAP_MODEL: 'x' }), 'claude').claude, 'x');
    assert.equal(modelsOf(get({ TAB_RECAP_MODEL: 'x' }), 'claude').codex, '');
    assert.equal(modelsOf(get({ TAB_RECAP_MODEL: 'x' }), 'auto').claude, '');
    assert.equal(modelsOf(get({ TAB_RECAP_CLAUDE_MODEL: '', TAB_RECAP_MODEL: 'x' }), 'claude').claude, 'x');
});

test('Backends: picks from the cache, says so when nothing is available, and toasts once per start', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-backends-'));
    const saved = { dir: process.env['HERDR_PLUGIN_CONFIG_DIR'], backend: process.env['TAB_RECAP_BACKEND'] };
    process.env['HERDR_PLUGIN_CONFIG_DIR'] = dir;
    process.env['TAB_RECAP_BACKEND'] = 'auto';
    try {
        let ids: string[] = [];
        const toasts: string[] = [];
        const lines: string[] = [];
        const herdr = { available: (): Promise<HarnessList> => Promise.resolve(found(...ids)) };
        const path = { available: (): Promise<HarnessList> => Promise.resolve(found(...ids)) };
        const notifier = { notify: (title: string, body: string): Promise<{ kind: 'shown' }> => { toasts.push(`${title}: ${body}`); return Promise.resolve({ kind: 'shown' }); } };
        const backends = new Backends(must(parseDirectory(dir)), { herdr, path }, notifier, (line) => { lines.push(line); }, fakeRuntime({ scripts: {} }));
        await backends.refresh();
        await backends.refresh();
        assert.equal(toasts.length, 1, 'one toast, not one per resync');
        assert.equal(backends.summarizer().backend, 'none');
        const written = await backends.summarizer().write(requestOf());
        assert.ok(written.kind === 'unknown' && written.why.why === 'not-found');
        ids = ['opencode', 'codex'];
        await backends.refresh();
        assert.equal(backends.summarizer().backend, 'codex');
        process.env['TAB_RECAP_BACKEND'] = 'opencode';
        assert.equal(backends.summarizer().backend, 'opencode', 'the configuration is re-read for every recap');
    } finally {
        for (const [key, value] of [['HERDR_PLUGIN_CONFIG_DIR', saved.dir], ['TAB_RECAP_BACKEND', saved.backend]] as const) {
            if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; }
        }
        rmSync(dir, { recursive: true });
    }
});
