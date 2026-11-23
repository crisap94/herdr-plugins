import { parseCount } from '#src/recap/domain/count.ts';
import { policyOf, tuningOf } from './fakes/settings-readers.ts';
import { candidateFor } from './autocompact-world.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';
import { test } from 'node:test';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wireAutocompact } from '#src/daemon/autocompact.ts';
import { LaneClaims } from '#src/recap/application/lane-claims.ts';
import { coverageOf } from '#src/daemon/compaction.ts';
import type { Settings } from '#src/daemon/config.ts';
import { loadSettings } from '#src/daemon/config.ts';
import type { CheckedFact } from '#src/recap/domain/autocompact.ts';
import type { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import type { LaneRecent } from '#src/recap/application/lane-recent.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import type { TabRecaps } from '#src/engine/tab-recaps.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { DecidedAnswersResult, DeciderPort } from '#src/ports/decider.ts';
import type { InFlightResult, Located, Transcripts } from '#src/ports/transcripts.ts';
import { memoryStore } from './db/support.ts';
import { decidedOf, textOf } from './fakes/decider-fixtures.ts';
import { agentKind } from '#test/support/ids.ts';
import { sourcePathOf } from '#src/ports/transcripts.ts';
import { runningOf } from '#src/recap/domain/in-flight.ts';

const env = (keys: Readonly<Record<string, string>>) => (key: string): string | undefined => keys[key];

function configOf(keys: Readonly<Record<string, string>>): Settings {
    return { autocompact: { ...policyOf(env(keys)), mode: 'on' }, tuning: tuningOf(env(keys)) } as unknown as Settings;
}

function keeping(keeps: number): DeciderPort {
    return { label: textOf('fake'), ask: (_s, questions): Promise<DecidedAnswersResult> => Promise.resolve(decidedOf(Object.fromEntries([...questions.keys()].map((id): [string, number] => [id, keeps])))) };
}

function inertTranscripts(): Transcripts {
    return {
        agent: agentKind('claude'),
        locate: (): Promise<Located> => Promise.resolve({ kind: 'located', source: sourcePathOf('s') }),
        read: (): Promise<never> => Promise.reject(new Error('unused')),
        latestPrompt: (): Promise<never> => Promise.reject(new Error('unused')),
        inFlight: { kind: 'supported', split: { kind: 'foreground-only', why: 'codex-cells' }, read: (): Promise<InFlightResult> => Promise.resolve({ kind: 'in-flight', count: runningOf(0), background: [] }) },
    };
}

async function decisionUnder(keys: Readonly<Record<string, string>>, closes: number): Promise<string | undefined> {
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    const decider: DeciderPort = {
        label: textOf('fake'),
        ask: (_state, questions): Promise<DecidedAnswersResult> => Promise.resolve(decidedOf(Object.fromEntries([...questions.keys()].map((id) => [id, id === 'closes_request' ? closes : 0.15])))),
    };
    const transcripts: Transcripts = {
        agent: agentKind('claude'),
        locate: () => Promise.resolve({ kind: 'located', source: sourcePathOf('transcript') }),
        read: () => Promise.reject(new Error('not read here')),
        latestPrompt: () => Promise.reject(new Error('not read here')),
        inFlight: { kind: 'supported', split: { kind: 'foreground-only', why: 'codex-cells' }, read: () => Promise.resolve({ kind: 'in-flight', count: runningOf(0), background: [] }) },
    };
    const service = wireAutocompact({
        config: () => configOf(keys),
        awaiting: () => Promise.resolve({ kind: 'clear' }),
        store,
        transcripts: registryWith({ [transcripts.agent]: transcripts }),
        contexts: { of: () => ({ tokens: 620_000, window: 1_000_000, source: 'observed' }) } as unknown as LaneContexts,
        recent: { of: () => Promise.resolve([]) } as unknown as LaneRecent,
        recaps: { refresh: (): Promise<void> => Promise.resolve(), flush: (): Promise<void> => Promise.resolve() } satisfies Pick<TabRecaps, 'refresh' | 'flush'>,
        informer: { current: emptyBoard() } as unknown as Informer,
        decider: () => decider,
        events: { lane: () => undefined, inWorkspace: () => undefined },
        claims: new LaneClaims(),
        log: () => undefined,
    });
    const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' });
    await service.consider(candidateFor(lane));
    return store.decisions.newest(must(parseCount(1)))[0]?.verdict;
}

test('the daemon wiring hands the configured style to the service: a close of 0.65 is compact under eager and undecided under balanced', async () => {
    assert.equal(await decisionUnder({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' }, 0.65), 'compact');
    assert.equal(await decisionUnder({ TAB_RECAP_AUTOCOMPACT_STYLE: 'balanced' }, 0.65), 'undecided');
});

test('the daemon wiring reads the safe key: warnings of 0.42 wait under eager\'s 0.40 and compact once the key sets 0.44', async () => {
    const warned = { closes_request: 0.95, announces_continuation: 0.42, asks_detailed_choice: 0.02, needs_verbatim: 0.10, changes_subject: 0.03, stuck: 0.01 };
    const decider: DeciderPort = { label: textOf('fake'), ask: () => Promise.resolve(decidedOf(warned)) };
    const verdictWith = async (keys: Readonly<Record<string, string>>): Promise<string | undefined> => {
        const store = memoryStore();
        store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
        const service = wireAutocompact({
            config: () => configOf(keys), awaiting: () => Promise.resolve({ kind: 'clear' }), store, claims: new LaneClaims(),
            transcripts: registryWith({ claude: inertTranscripts() }),
            contexts: { of: () => ({ tokens: 620_000, window: 1_000_000, source: 'observed' }) } as unknown as LaneContexts,
            recent: { of: () => Promise.resolve([]) } as unknown as LaneRecent, recaps: { refresh: (): Promise<void> => Promise.resolve(), flush: (): Promise<void> => Promise.resolve() } satisfies Pick<TabRecaps, 'refresh' | 'flush'>,
            informer: { current: emptyBoard() } as unknown as Informer, decider: () => decider,
            events: { lane: () => undefined, inWorkspace: () => undefined }, log: () => undefined,
        });
        await service.consider(candidateFor(laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' })));
        return store.decisions.newest(must(parseCount(1)))[0]?.verdict;
    };
    assert.equal(await verdictWith({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' }), 'wait');
    assert.equal(await verdictWith({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager', TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST: '0.44' }), 'compact');
});

test('coverageOf: the pass mark is read from the tuning in force; a missing decider means no check', async () => {
    const needs: readonly CheckedFact[] = [{ section: 'needs', text: textOf('Keep the token'), why: null }];
    const eager = tuningOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' }));
    const balanced = tuningOf(env({}));
    assert.equal((await coverageOf(keeping(0.65), () => eager)?.check(must(parseText('the brief')), needs))?.complete, 'present', 'eager passes at 0.60');
    assert.equal((await coverageOf(keeping(0.65), () => balanced)?.check(must(parseText('the brief')), needs))?.complete, 'absent', 'balanced needs 0.70');
    assert.equal(coverageOf(null, () => balanced), null);
});

test('loadSettings reads the style from the environment: eager gives its pass mark and its tuning, and the policy\'s ceiling', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tab-recap-style-'));
    const saved = { style: process.env['TAB_RECAP_AUTOCOMPACT_STYLE'], dir: process.env['HERDR_PLUGIN_CONFIG_DIR'] };
    try {
        process.env['TAB_RECAP_AUTOCOMPACT_STYLE'] = 'eager';
        process.env['HERDR_PLUGIN_CONFIG_DIR'] = dir;
        const config = loadSettings();
        assert.deepEqual([config.tuning.style, config.tuning.coverageAtLeast, config.tuning.recheckIdleMs, config.autocompact.ceiling], ['eager', 0.60, 1_800_000, 65]);
    } finally {
        if (saved.style === undefined) delete process.env['TAB_RECAP_AUTOCOMPACT_STYLE']; else process.env['TAB_RECAP_AUTOCOMPACT_STYLE'] = saved.style;
        if (saved.dir === undefined) delete process.env['HERDR_PLUGIN_CONFIG_DIR']; else process.env['HERDR_PLUGIN_CONFIG_DIR'] = saved.dir;
        rmSync(dir, { recursive: true, force: true });
    }
});
