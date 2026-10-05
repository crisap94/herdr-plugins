import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onPath, PathHarnesses } from '#src/adapters/path-harnesses.ts';
import { Backends, intersect, pick } from '#src/daemon/backends.ts';
import { backendOf, modelsOf } from '#src/daemon/config.ts';
import type { HarnessesResult } from '#src/ports/harnesses.ts';
import { unknown } from '#src/ports/unknowable.ts';

const found = (...ids: string[]): HarnessesResult => ({ kind: 'available', ids });
const get = (values: Record<string, string>) => (key: string): string | undefined => values[key];
const down = unknown({ why: 'unreachable', detail: 'no socket' });

test('auto: the first of claude → codex → opencode → hermes that is available; a named one is taken as named', () => {
    assert.equal(pick('auto', ['hermes', 'opencode', 'codex']), 'codex');
    assert.equal(pick('auto', ['hermes']), 'hermes');
    assert.equal(pick('auto', ['pi', 'custom']), null);
    assert.equal(pick('auto', []), null);
    assert.equal(pick('opencode', []), 'opencode');
});

test('availability is herdr ∩ PATH; the PATH alone when herdr cannot be asked; herdr alone if the PATH cannot', () => {
    assert.deepEqual(intersect(found('claude', 'codex'), found('codex', 'hermes')), found('codex'));
    assert.deepEqual(intersect(down, found('hermes')), found('hermes'));
    assert.deepEqual(intersect(found('claude'), down), found('claude'));
});

test('PathHarnesses: only executables that resolve on PATH', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-path-'));
    const before = process.env['PATH'];
    try {
        writeFileSync(join(dir, 'hermes'), '#!/bin/sh\n');
        chmodSync(join(dir, 'hermes'), 0o755);
        writeFileSync(join(dir, 'codex'), 'not executable');
        process.env['PATH'] = dir;
        assert.deepEqual(await new PathHarnesses(['claude', 'codex', 'hermes']).available(), found('hermes'));
        assert.equal(onPath('hermes', dir), true);
        assert.equal(onPath('claude', dir), false);
    } finally {
        process.env['PATH'] = before;
        rmSync(dir, { recursive: true });
    }
});

test('models: own key, then legacy keys; the legacy generic model only for the backend named', () => {
    assert.equal(backendOf(undefined), 'auto');
    assert.equal(backendOf('nonsense'), 'auto');
    assert.equal(backendOf('hermes'), 'hermes');
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
        const herdr = { available: (): Promise<HarnessesResult> => Promise.resolve(found(...ids)) };
        const path = { available: (): Promise<HarnessesResult> => Promise.resolve(found(...ids)) };
        const notifier = { notify: (title: string, body: string): Promise<{ kind: 'shown' }> => { toasts.push(`${title}: ${body}`); return Promise.resolve({ kind: 'shown' }); } };
        const backends = new Backends(dir, { herdr, path }, notifier, (line) => { lines.push(line); });
        await backends.refresh();
        await backends.refresh();
        assert.equal(toasts.length, 1, 'one toast, not one per resync');
        assert.equal(backends.summarizer().backend, 'none');
        const written = await backends.summarizer().write({ previous: '', excerpt: '', language: 'en', previousLanguage: 'en', lanes: [] });
        assert.ok(written.kind === 'unknown' && written.why.why === 'not-found');
        ids = ['hermes', 'codex'];
        await backends.refresh();
        assert.equal(backends.summarizer().backend, 'codex');
        process.env['TAB_RECAP_BACKEND'] = 'hermes';
        assert.equal(backends.summarizer().backend, 'hermes', 'the configuration is re-read for every recap');
    } finally {
        for (const [key, value] of [['HERDR_PLUGIN_CONFIG_DIR', saved.dir], ['TAB_RECAP_BACKEND', saved.backend]] as const) {
            if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; }
        }
        rmSync(dir, { recursive: true });
    }
});
