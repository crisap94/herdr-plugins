import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { parseCount, must } from '@stateforge-labs/session-ledger';
import { parseText } from '@stateforge-labs/session-ledger';
import type { CheckedFact, DecidedAnswersResult, DeciderPort } from '@stateforge-labs/session-ledger';
import { runningOf, sourcePathOf } from '@stateforge-labs/session-ledger';
import type { InFlightResult, Located, LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { wireAutocompact } from '#src/daemon/autocompact.ts';
import { coverageOf } from '#src/daemon/compaction.ts';
import { loadSettings } from '#src/daemon/config.ts';
import type { Settings } from '#src/daemon/config.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import { LaneClaims } from '#src/recap/application/lane-claims.ts';
import type { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import type { LaneRecent } from '#src/recap/application/lane-recent.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { decidedOf, textOf } from '#test/fakes/decider-fixtures.ts';
import { memoryStore } from '#test/db/support.ts';
import { agentKind } from '#test/support/ids.ts';
import { seenLane } from '#test/support/seen.ts';
import { candidateFor } from '#test/autocompact-world.ts';
import { configText, prepareStateStore, seedConfig, viewWorld, type Pane, type ViewWorld } from '../support/view-world.ts';
import { NOW, VERSION } from '../support/view-seeds.ts';

const START = '# my notes\nTAB_RECAP_BACKEND=codex\n# keep me\nTAB_RECAP_GLOW=450\n';
const ENTRY = join(import.meta.dirname, '..', '..', '..', 'bin', 'tab-recap.mjs');
const STYLE_ROW = 14;

let world: ViewWorld;

before(async () => {
    world = await viewWorld({ now: NOW, version: VERSION, agents: ['claude', 'codex'] });
    seedConfig(world, START);
    prepareStateStore(world);
});

after(async () => {
    await world.close();
});

async function opened(over: Readonly<Record<string, string>> = {}): Promise<Pane> {
    const pane = await world.settings({ cols: 140, rows: 60, env: over });
    await pane.painted((screen) => /● claude/.test(screen.text), 'the settings found the agents');
    return pane;
}

async function typed(pane: Pane, keys: readonly string[]): Promise<void> {
    for (const key of keys) {
        await pane.press(key);
    }
}

const onStyleRow = (pane: Pane): Promise<void> => typed(pane, Array.from({ length: STYLE_ROW }, () => 'j'));

const text = (pane: Pane): string => pane.screen()?.text ?? '';

async function command(...args: readonly string[]): Promise<{ readonly code: number | null; readonly stdout: string; readonly stderr: string }> {
    const child = spawn(process.execPath, [ENTRY, ...args], { cwd: world.plugin, env: world.childEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const code = await new Promise<number | null>((resolve) => { child.on('close', resolve); });
    return { code, stdout, stderr };
}

function inertTranscripts(): SessionReader {
    return {
        agent: agentKind('claude'),
        locate: (): Promise<Located> => Promise.resolve({ kind: 'located', source: sourcePathOf('s') }),
        read: (): Promise<never> => Promise.reject(new Error('unused')),
        latestPrompt: (): Promise<never> => Promise.reject(new Error('unused')),
        inFlight: { kind: 'supported', split: { kind: 'foreground-only', why: 'codex-cells' }, read: (): Promise<InFlightResult> => Promise.resolve({ kind: 'in-flight', count: runningOf(0), background: [] }) },
    };
}

const settings = (): Settings => { const read = loadSettings(); return { ...read, autocompact: { ...read.autocompact, mode: 'on' } }; };

async function verdictUnderSavedStyle(answers: Readonly<Record<string, number>>): Promise<string | undefined> {
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    const decider: DeciderPort = { label: textOf('fake'), ask: (_state, questions): Promise<DecidedAnswersResult> => Promise.resolve(decidedOf(Object.fromEntries([...questions.keys()].map((id): [string, number] => [id, answers[id] ?? 0.02])))) };
    const service = wireAutocompact({
        config: settings, awaiting: () => Promise.resolve({ kind: 'clear' }), store, claims: new LaneClaims(),
        transcripts: registryWith({ claude: inertTranscripts() }),
        contexts: { of: () => ({ tokens: 620_000, window: 1_000_000, source: 'observed' }) } as unknown as LaneContexts,
        recent: { of: () => Promise.resolve([]) } as unknown as LaneRecent,
        recaps: { refresh: (): Promise<void> => Promise.resolve(), flush: (): Promise<void> => Promise.resolve() } satisfies Pick<TabRecaps, 'refresh' | 'flush'>,
        informer: { current: emptyBoard() } as unknown as Informer, decider: () => decider,
        events: { lane: () => undefined, inWorkspace: () => undefined }, log: () => undefined,
    });
    await service.consider(candidateFor(laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' }))));
    return store.decisions.newest(must(parseCount(1)))[0]?.verdict;
}

test('the row starts at balanced and says what it controls when it is focused', { timeout: 30_000 }, async () => {
    const pane = await opened();
    try {
        await onStyleRow(pane);
        const shown = await pane.painted((screen) => /Autocompact style\s+balanced — today's numbers/.test(screen.text), 'the style row reads balanced');
        assert.match(shown.text, /how eagerly it acts/);
    } finally {
        await pane.close();
    }
});

test('Enter lists the three choices with what each one does', { timeout: 30_000 }, async () => {
    const pane = await opened();
    try {
        await onStyleRow(pane);
        await pane.press('\r');
        const choosing = await pane.painted((screen) => screen.text.includes('eager — acts sooner; asks an idle lane again every 30 min'), 'the choices are painted');
        assert.match(choosing.text, /gentle — waits for a clearer moment/);
        assert.match(choosing.text, /balanced — today's numbers/);
    } finally {
        await pane.close();
    }
});

test('choosing eager and saving writes TAB_RECAP_AUTOCOMPACT_STYLE and nothing else, keeping every comment and line', { timeout: 30_000 }, async () => {
    const pane = await opened();
    try {
        await onStyleRow(pane);
        await typed(pane, ['\r', 'j', '\r', 's']);
        await pane.painted((screen) => screen.text.includes('saved — applies to the next recap'), 'saved');
        assert.equal(configText(world), `${START}TAB_RECAP_AUTOCOMPACT_STYLE=eager\n`);
    } finally {
        await pane.close();
    }
});

test('the autocompact command follows the saved style: its style line carries eager\'s pass mark, ceiling and re-check', { timeout: 30_000 }, async () => {
    const ran = await command('autocompact');
    assert.equal(ran.code, 0, ran.stderr);
    const first = ran.stdout.split('\n')[0] ?? '';
    assert.match(first, /^style eager · /);
    assert.match(first, /pass mark 0\.60/);
    assert.match(first, /ceiling 65 %/);
    assert.match(first, /re-check 30 min/);
});

test('the daemon settings read the saved style: eager gives its tuning and the policy ceiling', { timeout: 30_000 }, () => {
    const config = loadSettings();
    assert.deepEqual([config.tuning.style, config.tuning.coverageAtLeast, config.tuning.recheckIdleMs, config.autocompact.ceiling], ['eager', 0.60, 1_800_000, 65]);
});

test('the daemon wiring decides by the saved style: a close of 0.65 is compact under eager and undecided under balanced', { timeout: 30_000 }, async () => {
    assert.equal(await verdictUnderSavedStyle({ closes_request: 0.65, announces_continuation: 0.15, asks_detailed_choice: 0.15, needs_verbatim: 0.15, changes_subject: 0.15, stuck: 0.15 }), 'compact');
    seedConfig(world, START);
    assert.equal(await verdictUnderSavedStyle({ closes_request: 0.65, announces_continuation: 0.15, asks_detailed_choice: 0.15, needs_verbatim: 0.15, changes_subject: 0.15, stuck: 0.15 }), 'undecided');
    seedConfig(world, `${START}TAB_RECAP_AUTOCOMPACT_STYLE=eager\n`);
});

test('the daemon wiring reads the safe key: warnings of 0.42 wait under eager and compact once the key sets 0.44', { timeout: 30_000 }, async () => {
    const warned = { closes_request: 0.95, announces_continuation: 0.42, asks_detailed_choice: 0.02, needs_verbatim: 0.10, changes_subject: 0.03, stuck: 0.01 };
    assert.equal(await verdictUnderSavedStyle(warned), 'wait');
    seedConfig(world, `${START}TAB_RECAP_AUTOCOMPACT_STYLE=eager\nTAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST=0.44\n`);
    assert.equal(await verdictUnderSavedStyle(warned), 'compact');
    seedConfig(world, `${START}TAB_RECAP_AUTOCOMPACT_STYLE=eager\n`);
});

test('the brief check reads the pass mark of the saved style: 0.65 passes under eager and fails under balanced, and no decider means no check', { timeout: 30_000 }, async () => {
    const needs: readonly CheckedFact[] = [{ section: 'needs', text: textOf('Keep the token'), why: null }];
    const keeping: DeciderPort = { label: textOf('fake'), ask: (_state, questions): Promise<DecidedAnswersResult> => Promise.resolve(decidedOf(Object.fromEntries([...questions.keys()].map((id): [string, number] => [id, 0.65])))) };
    const brief = must(parseText('the brief'));
    assert.equal((await coverageOf(keeping, () => loadSettings().tuning)?.check(brief, needs))?.complete, 'present');
    seedConfig(world, START);
    assert.equal((await coverageOf(keeping, () => loadSettings().tuning)?.check(brief, needs))?.complete, 'absent');
    assert.equal(coverageOf(null, () => loadSettings().tuning), null);
    seedConfig(world, `${START}TAB_RECAP_AUTOCOMPACT_STYLE=eager\n`);
});

test('the file\'s value is read as it is for gentle and eager in any case, and anything else is balanced', { timeout: 60_000 }, async () => {
    const readBack: Record<string, RegExp> = { gentle: /Autocompact style\s+gentle — waits/, EAGER: /Autocompact style\s+eager — acts sooner/, aggressive: /Autocompact style\s+balanced — today's numbers/ };
    for (const [value, expected] of Object.entries(readBack)) {
        seedConfig(world, `${START}TAB_RECAP_AUTOCOMPACT_STYLE=${value}\n`);
        const pane = await opened();
        try {
            await onStyleRow(pane);
            await pane.painted((screen) => expected.test(screen.text), `${value} reads back`);
        } finally {
            await pane.close();
        }
    }
    seedConfig(world, START);
});

test('a style an environment variable sets is read-only: the row names the variable, a change is refused and the style is never written while another row is saved', { timeout: 30_000 }, async () => {
    seedConfig(world, START);
    const pane = await opened({ TAB_RECAP_AUTOCOMPACT_STYLE: 'gentle' });
    try {
        await onStyleRow(pane);
        await pane.painted((screen) => screen.text.includes('read-only: TAB_RECAP_AUTOCOMPACT_STYLE is set in the environment'), 'the row names its variable');
        await pane.press('\r');
        await pane.painted((screen) => screen.text.includes('read-only'), 'a locked row stays as it was');
        assert.doesNotMatch(text(pane), /▸ .*choose/);
        await typed(pane, ['j', '\r', 'j', '\r', 's']);
        await pane.painted((screen) => screen.text.includes('saved — applies to the next recap'), 'the other rows were saved');
        assert.doesNotMatch(configText(world), /TAB_RECAP_AUTOCOMPACT_STYLE/);
    } finally {
        await pane.close();
    }
});

test('the row and its choices read in Spanish', { timeout: 30_000 }, async () => {
    seedConfig(world, 'TAB_RECAP_LOCALE=es\n');
    const pane = await opened();
    try {
        await onStyleRow(pane);
        await pane.painted((screen) => /Estilo autocomp\.\s+balanced — los números de siempre/.test(screen.text), 'the row in Spanish');
        await pane.press('\r');
        await pane.painted((screen) => screen.text.includes('eager — actúa antes; vuelve a mirar un agente libre cada 30 min'), 'the choices in Spanish');
    } finally {
        await pane.close();
    }
});
