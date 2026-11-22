import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import { contextWindows } from '#src/adapters/capability/context-window.ts';
import { CompactLimitFiles } from '#src/adapters/capability/compact-limits.ts';
import { ClaudeLaunchPosix } from '#src/adapters/capability/claude-launch-posix.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { must } from '#src/protocol/result.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import { parseSessionId, agentKind } from '#src/recap/domain/ids.ts';
import type { Transcripts } from '#src/ports/transcripts.ts';
import type { ModelCatalogue } from '#src/ports/model-catalogue.ts';
import { sourcePathOf } from '#src/ports/transcripts.ts';

const SESSION = 'session-1';
const PID = 4242;
const START = '777001';

const roots: string[] = [];
const tempDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-launch-'));
    roots.push(dir);
    return dir;
};
process.on('exit', () => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const write = (file: string, text: string): void => {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, text);
};

const statLine = (pid: number, start: string): string => `${pid} (claude) ${['S', ...Array(18).fill('0'), start].join(' ')}\n`;

const NUL = '\u0000';

interface Launch {
    readonly environ?: readonly string[];
    readonly cmdline?: readonly string[];
    readonly recordedStart?: string;
    readonly start?: string;
}

interface Setup {
    readonly home?: object;
    readonly managed?: object;
    readonly project?: object;
    readonly files?: Readonly<Record<string, string>>;
    readonly launch?: Launch;
    readonly procAbsent?: boolean;
}

const launchFixture = (home: string, proc: string, cwd: string, launch: Launch, procPresent: boolean): void => {
    write(join(home, '.claude', 'sessions', `${PID}.json`), JSON.stringify({ pid: PID, sessionId: SESSION, cwd, procStart: launch.recordedStart ?? START }));
    if (!procPresent) {
        return;
    }
    write(join(proc, String(PID), 'stat'), statLine(PID, launch.start ?? START));
    write(join(proc, String(PID), 'environ'), (launch.environ ?? []).map((entry) => `${entry}${NUL}`).join(''));
    write(join(proc, String(PID), 'cmdline'), (launch.cmdline ?? ['claude']).map((arg) => `${arg}${NUL}`).join(''));
};

function reader(model: string, tokens: number): Transcripts {
    return {
        agent: agentKind('claude'),
        inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
        locate: () => Promise.resolve({ kind: 'located', source: sourcePathOf('s') }),
        read: () => Promise.reject(new Error('not used')),
        latestPrompt: () => Promise.reject(new Error('not used')),
        observed: () => Promise.resolve({ kind: 'observed', observed: { tokens, peak: tokens, window: null, model } }),
    };
}

const catalogue: ModelCatalogue = { windowOf: (model) => (model === 'claude-opus-5-5' ? 1_000_000 : null) };

const laneOf = (cwd: string): ReturnType<typeof laneFrom> => laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', cwd, session: SESSION });

async function measure(setup: Setup): Promise<ReturnType<LaneContexts['of']>> {
    const home = tempDir();
    const cwd = tempDir();
    const proc = setup.procAbsent === true ? join(tempDir(), 'no-proc') : tempDir();
    const managed = join(home, 'managed-settings.json');
    if (setup.home !== undefined) write(join(home, '.claude', 'settings.json'), JSON.stringify(setup.home));
    if (setup.managed !== undefined) write(managed, JSON.stringify(setup.managed));
    if (setup.project !== undefined) write(join(cwd, '.claude', 'settings.json'), JSON.stringify(setup.project));
    for (const [name, text] of Object.entries(setup.files ?? {})) write(join(cwd, name), text);
    if (setup.launch !== undefined) launchFixture(home, proc, cwd, setup.launch, setup.procAbsent !== true);
    const contexts = new LaneContexts(
        registryWith({ claude: reader('claude-opus-5-5', 240_000) }),
        contextWindows(catalogue),
        new CompactLimitFiles({ home: must(parseFsPath(home)), managed: [must(parseFsPath(managed))] }, new ClaudeLaunchPosix({ home: must(parseFsPath(home)), proc: must(parseFsPath(proc)) })),
        () => null,
    );
    await contexts.refresh(laneOf(cwd));
    return contexts.of('w1:p1');
}

test('the session environment window beats the settings file window', async () => {
    const use = await measure({ home: { autoCompactWindow: 400_000 }, launch: { environ: ['CLAUDE_CODE_AUTO_COMPACT_WINDOW=300000'] } });
    assert.deepEqual(use, { tokens: 240_000, window: 300_000, source: 'agent' });
});

test('the environment window takes a k or m suffix', async () => {
    assert.equal((await measure({ launch: { environ: ['CLAUDE_CODE_AUTO_COMPACT_WINDOW=400k'] } }))?.window, 400_000);
    assert.equal((await measure({ launch: { environ: ['CLAUDE_CODE_AUTO_COMPACT_WINDOW=0.5m'] } }))?.window, 500_000);
});

test('an environment window under 100000 is ignored and the settings window applies', async () => {
    const use = await measure({ home: { autoCompactWindow: 400_000 }, launch: { environ: ['CLAUDE_CODE_AUTO_COMPACT_WINDOW=50000'] } });
    assert.equal(use?.window, 400_000);
});

test('CLAUDE_AUTOCOMPACT_PCT_OVERRIDE lowers the cap to that share of the window', async () => {
    const lowered = await measure({ launch: { environ: ['CLAUDE_CODE_AUTO_COMPACT_WINDOW=400000', 'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50'] } });
    assert.deepEqual(lowered, { tokens: 240_000, window: 200_000, source: 'agent' });
    assert.equal((await measure({ launch: { environ: ['CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80'] } }))?.window, 800_000);
});

test('a settings file env entry applies, and beats its own autoCompactWindow', async () => {
    const use = await measure({ home: { autoCompactWindow: 300_000, env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '400000' } } });
    assert.equal(use?.window, 400_000);
});

test('an inline --settings JSON layer ranks above project and user settings and below managed', async () => {
    const flagged = ['claude', '--settings', '{"autoCompactWindow":300000}'];
    assert.equal((await measure({ home: { autoCompactWindow: 400_000 }, project: { autoCompactWindow: 350_000 }, launch: { cmdline: flagged } }))?.window, 300_000);
    assert.equal((await measure({ managed: { autoCompactWindow: 250_000 }, home: { autoCompactWindow: 400_000 }, project: { autoCompactWindow: 350_000 }, launch: { cmdline: ['claude', '--settings={"autoCompactWindow":300000}'] } }))?.window, 250_000);
});

test('a relative --settings file is read from the session cwd and ranks like an inline layer', async () => {
    const use = await measure({
        project: { autoCompactWindow: 350_000 },
        files: { 'flags.json': JSON.stringify({ autoCompactWindow: 320_000 }) },
        launch: { cmdline: ['claude', '--settings=flags.json'] },
    });
    assert.equal(use?.window, 320_000);
});

test('a stale pid whose start time no longer matches is ignored', async () => {
    const use = await measure({ home: { autoCompactWindow: 400_000 }, launch: { environ: ['CLAUDE_CODE_AUTO_COMPACT_WINDOW=300000'], recordedStart: '999', start: '123' } });
    assert.equal(use?.window, 400_000);
});

test('a session with no pid file falls back to the settings files', async () => {
    assert.equal((await measure({ home: { autoCompactWindow: 400_000 } }))?.window, 400_000);
});

test('a missing proc tree returns the settings file behaviour', async () => {
    const use = await measure({ home: { autoCompactWindow: 400_000 }, procAbsent: true, launch: { environ: ['CLAUDE_CODE_AUTO_COMPACT_WINDOW=300000'] } });
    assert.equal(use?.window, 400_000);
});

test('another environment variable value never leaves the launch reader', () => {
    const home = tempDir();
    const cwd = tempDir();
    const proc = tempDir();
    launchFixture(home, proc, cwd, { environ: ['ANTHROPIC_API_KEY=sk-secret-value-123', 'CLAUDE_CODE_AUTO_COMPACT_WINDOW=300000'] }, true);
    const launch = new ClaudeLaunchPosix({ home: must(parseFsPath(home)), proc: must(parseFsPath(proc)) }).launchOf(must(parseSessionId(SESSION)));
    assert.deepEqual(launch?.env, { window: 300_000, percent: null });
    assert.ok(!JSON.stringify(launch).includes('sk-secret-value-123'));
});
