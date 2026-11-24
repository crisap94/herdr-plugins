import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import { agentWindows } from '#src/adapters/capability/context-window.ts';
import { CompactLimitFiles } from '#src/adapters/capability/compact-limits.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import type { LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import type { ModelWindows } from '#src/ports/model-catalogue.ts';
import { agentKind } from '#test/support/ids.ts';
import { sourcePathOf } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { paneId } from '#test/support/ids.ts';
import { seenLane } from '#test/support/seen.ts';

const roots: string[] = [];
const tempDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'compact-limits-'));
    roots.push(dir);
    return dir;
};
process.on('exit', () => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const write = (file: string, text: string): void => {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, text);
};

const lane = (agent: string, cwd: string): ReturnType<typeof laneFrom> => laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent, cwd }));

function reader(agent: string, model: string | null, tokens: number, window: number | null): SessionReader {
    return {
        agent: agentKind(agent),
        inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
        locate: () => Promise.resolve({ kind: 'located', source: sourcePathOf('s') }),
        read: () => Promise.reject(new Error('not used')),
        latestPrompt: () => Promise.reject(new Error('not used')),
        observed: () => Promise.resolve({ kind: 'observed', observed: { tokens: countOf(tokens), peak: countOf(tokens), window: window === null ? null : countOf(window), model: model === null ? null : textOf(model) } }),
    };
}

const catalogue = (windows: Record<string, number>): ModelWindows => ({ windowOf: (model) => { const window = windows[model]; return window === undefined ? null : countOf(window); } });

const claudeAt = (home: string, setting: number | null = null): LaneContexts => new LaneContexts(
    registryWith({ claude: reader('claude', 'claude-opus-5-5', 240_000, null) }),
    agentWindows(catalogue({ 'claude-opus-5-5': 1_000_000 })),
    new CompactLimitFiles({ home: must(parseFsPath(home)), managed: [must(parseFsPath(join(home, 'managed-settings.json')))] }),
    () => (setting === null ? null : countOf(setting)),
);

test('a user autoCompactWindow caps the 1M Claude window to the window the agent compacts at', async () => {
    const home = tempDir();
    const cwd = tempDir();
    write(join(home, '.claude', 'settings.json'), JSON.stringify({ autoCompactWindow: 400_000 }));
    const contexts = claudeAt(home);
    assert.equal(await contexts.refresh(lane('claude', cwd)), 'present');
    assert.deepEqual(contexts.of(paneId('w1:p1')), { tokens: 240_000, window: 400_000, source: 'agent' });
});

test('a per-model entry in modelSettings beats the top-level autoCompactWindow', async () => {
    const home = tempDir();
    const cwd = tempDir();
    write(join(home, '.claude', 'settings.json'), JSON.stringify({
        autoCompactWindow: 300_000,
        modelSettings: { 'claude-opus-5-5': { autoCompactWindow: 450_000 } },
    }));
    const contexts = claudeAt(home);
    await contexts.refresh(lane('claude', cwd));
    assert.equal(contexts.of(paneId('w1:p1'))?.window, 450_000);
});

test('the project settings.json beats the user settings file', async () => {
    const home = tempDir();
    const cwd = tempDir();
    write(join(home, '.claude', 'settings.json'), JSON.stringify({ autoCompactWindow: 400_000 }));
    write(join(cwd, '.claude', 'settings.json'), JSON.stringify({ autoCompactWindow: 350_000 }));
    const contexts = claudeAt(home);
    await contexts.refresh(lane('claude', cwd));
    assert.equal(contexts.of(paneId('w1:p1'))?.window, 350_000);
});

test('"auto", a value under 100000 and a malformed file are no value: the window stays the model window', async () => {
    const home = tempDir();
    const cwd = tempDir();
    write(join(home, '.claude', 'settings.json'), JSON.stringify({ autoCompactWindow: 'auto' }));
    const contexts = claudeAt(home);
    await contexts.refresh(lane('claude', cwd));
    assert.deepEqual(contexts.of(paneId('w1:p1')), { tokens: 240_000, window: 1_000_000, source: 'catalogue' });
    write(join(home, '.claude', 'settings.json'), JSON.stringify({ autoCompactWindow: 50_000 }));
    write(join(cwd, '.claude', 'settings.json'), '{ not json');
    await contexts.refresh(lane('claude', cwd));
    assert.equal(contexts.of(paneId('w1:p1'))?.window, 1_000_000);
});

test('the TAB_RECAP_CONTEXT_WINDOW setting still wins over the agent limit', async () => {
    const home = tempDir();
    const cwd = tempDir();
    write(join(home, '.claude', 'settings.json'), JSON.stringify({ autoCompactWindow: 400_000 }));
    const contexts = claudeAt(home, 500_000);
    await contexts.refresh(lane('claude', cwd));
    assert.deepEqual(contexts.of(paneId('w1:p1')), { tokens: 240_000, window: 500_000, source: 'setting' });
});

test('a Codex model_auto_compact_token_limit before the first section caps the window; one after a section does not', async () => {
    const home = tempDir();
    const cwd = tempDir();
    const codex = (): LaneContexts => new LaneContexts(
        registryWith({ codex: reader('codex', 'gpt-6-luna', 116_000, 258_400) }),
        agentWindows(catalogue({})),
        new CompactLimitFiles({ home: must(parseFsPath(home)), managed: [must(parseFsPath(join(home, 'managed-settings.json')))] }),
        () => null,
    );
    write(join(home, '.codex', 'config.toml'), 'model = "gpt-6-luna"\nmodel_auto_compact_token_limit = 200000\n\n[profiles.big]\nmodel_auto_compact_token_limit = 900000\n');
    const contexts = codex();
    await contexts.refresh(lane('codex', cwd));
    assert.deepEqual(contexts.of(paneId('w1:p1')), { tokens: 116_000, window: 200_000, source: 'agent' });
    write(join(home, '.codex', 'config.toml'), '[profiles.big]\nmodel_auto_compact_token_limit = 200000\n');
    const after = codex();
    await after.refresh(lane('codex', cwd));
    assert.equal(after.of(paneId('w1:p1'))?.window, 258_400);
});

test('a settings file edited later is read again', async () => {
    const home = tempDir();
    const cwd = tempDir();
    const file = join(home, '.claude', 'settings.json');
    write(file, JSON.stringify({ autoCompactWindow: 400_000 }));
    const contexts = claudeAt(home);
    await contexts.refresh(lane('claude', cwd));
    assert.equal(contexts.of(paneId('w1:p1'))?.window, 400_000);
    write(file, JSON.stringify({ autoCompactWindow: 300_000 }));
    const later = new Date(Date.now() + 60_000);
    utimesSync(file, later, later);
    assert.equal(await contexts.refresh(lane('claude', cwd)), 'present');
    assert.equal(contexts.of(paneId('w1:p1'))?.window, 300_000);
});
