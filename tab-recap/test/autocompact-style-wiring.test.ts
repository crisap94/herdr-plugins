import { test } from 'node:test';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wireAutocompact } from '#src/daemon/autocompact.ts';
import { CompactionClaims } from '#src/recap/application/compaction-claims.ts';
import { coverageOf } from '#src/daemon/compaction.ts';
import type { Config } from '#src/daemon/config.ts';
import { loadConfig } from '#src/daemon/config.ts';
import type { CoverageFact } from '#src/recap/application/brief-coverage.ts';
import type { LaneContexts } from '#src/recap/application/lane-contexts.ts';
import type { LaneRecent } from '#src/recap/application/lane-recent.ts';
import type { Informer } from '#src/recap/application/informer.ts';
import type { RecapJob } from '#src/recap/application/recap-job.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import { policyOf } from '#src/recap/domain/autocompact.ts';
import { tuningOf } from '#src/recap/domain/autocompact-style.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Decider, DecidedResult } from '#src/ports/decider.ts';
import type { InFlightResult, Located, Transcripts } from '#src/ports/transcripts.ts';
import { memoryStore } from './db/support.ts';

const env = (keys: Readonly<Record<string, string>>) => (key: string): string | undefined => keys[key];

function configOf(keys: Readonly<Record<string, string>>): Config {
    return { autocompact: { ...policyOf(env(keys)), mode: 'on' }, tuning: tuningOf(env(keys)) } as unknown as Config;
}

function keeping(keeps: number): Decider {
    return { label: 'fake', ask: (_s, questions): Promise<DecidedResult> => Promise.resolve({ kind: 'decided', answers: Object.fromEntries(Object.keys(questions).map((id): [string, number] => [id, keeps])), tokens: 1, costUsd: 0, tookMs: 1, model: 'fake' }) };
}

function inertTranscripts(): Transcripts {
    return {
        agent: 'claude',
        locate: (): Promise<Located> => Promise.resolve({ kind: 'located', source: 's' }),
        read: (): Promise<never> => Promise.reject(new Error('unused')),
        latestPrompt: (): Promise<never> => Promise.reject(new Error('unused')),
        inFlight: { kind: 'supported', read: (): Promise<InFlightResult> => Promise.resolve({ kind: 'in-flight', count: 0 }) },
    };
}

async function decisionUnder(keys: Readonly<Record<string, string>>, closes: number): Promise<string | undefined> {
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    const decider: Decider = {
        label: 'fake',
        ask: (_state, questions): Promise<DecidedResult> => Promise.resolve({
            kind: 'decided',
            answers: Object.fromEntries(Object.keys(questions).map((id) => [id, id === 'closes_request' ? closes : 0.15])),
            tokens: 1, costUsd: 0, tookMs: 1, model: 'fake',
        }),
    };
    const transcripts: Transcripts = {
        agent: 'claude',
        locate: () => Promise.resolve({ kind: 'located', source: 'transcript' }),
        read: () => Promise.reject(new Error('not read here')),
        latestPrompt: () => Promise.reject(new Error('not read here')),
        inFlight: { kind: 'supported', read: () => Promise.resolve({ kind: 'in-flight', count: 0 }) },
    };
    const service = wireAutocompact({
        config: () => configOf(keys),
        awaiting: () => Promise.resolve({ kind: 'clear' }),
        store,
        transcripts: registryWith({ [transcripts.agent]: transcripts }),
        contexts: { of: () => ({ tokens: 620_000, window: 1_000_000, source: 'observed' }) } as unknown as LaneContexts,
        recent: { of: () => Promise.resolve([]) } as unknown as LaneRecent,
        recaps: { refreshNow: () => Promise.resolve() } as unknown as RecapJob,
        informer: { current: emptyBoard() } as unknown as Informer,
        decider: () => decider,
        events: { lane: () => undefined, inWorkspace: () => undefined },
        claims: new CompactionClaims(),
        log: () => undefined,
    });
    const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' });
    await service.consider(lane);
    return store.autocompact.newest(1)[0]?.verdict;
}

test('the daemon wiring hands the configured style to the service: a close of 0.65 is compact under eager and undecided under balanced', async () => {
    assert.equal(await decisionUnder({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' }, 0.65), 'compact');
    assert.equal(await decisionUnder({ TAB_RECAP_AUTOCOMPACT_STYLE: 'balanced' }, 0.65), 'undecided');
});

test('the daemon wiring reads the safe key: warnings of 0.42 wait under eager\'s 0.40 and compact once the key sets 0.44', async () => {
    const warned = { closes_request: 0.95, announces_continuation: 0.42, asks_detailed_choice: 0.02, needs_verbatim: 0.10, changes_subject: 0.03, stuck: 0.01 };
    const decider: Decider = { label: 'fake', ask: () => Promise.resolve({ kind: 'decided', answers: warned, tokens: 1, costUsd: 0, tookMs: 1, model: 'fake' }) };
    const verdictWith = async (keys: Readonly<Record<string, string>>): Promise<string | undefined> => {
        const store = memoryStore();
        store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
        const service = wireAutocompact({
            config: () => configOf(keys), awaiting: () => Promise.resolve({ kind: 'clear' }), store, claims: new CompactionClaims(),
            transcripts: registryWith({ claude: inertTranscripts() }),
            contexts: { of: () => ({ tokens: 620_000, window: 1_000_000, source: 'observed' }) } as unknown as LaneContexts,
            recent: { of: () => Promise.resolve([]) } as unknown as LaneRecent, recaps: { refreshNow: () => Promise.resolve() } as unknown as RecapJob,
            informer: { current: emptyBoard() } as unknown as Informer, decider: () => decider,
            events: { lane: () => undefined, inWorkspace: () => undefined }, log: () => undefined,
        });
        await service.consider(laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' }));
        return store.autocompact.newest(1)[0]?.verdict;
    };
    assert.equal(await verdictWith({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' }), 'wait');
    assert.equal(await verdictWith({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager', TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST: '0.44' }), 'compact');
});

test('coverageOf: the pass mark is read from the tuning in force; a missing decider means no check', async () => {
    const needs: readonly CoverageFact[] = [{ section: 'needs', text: 'Keep the token', why: null }];
    const eager = tuningOf(env({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' }));
    const balanced = tuningOf(env({}));
    assert.equal((await coverageOf(keeping(0.65), () => eager)?.check('the brief', needs))?.ok, true, 'eager passes at 0.60');
    assert.equal((await coverageOf(keeping(0.65), () => balanced)?.check('the brief', needs))?.ok, false, 'balanced needs 0.70');
    assert.equal(coverageOf(null, () => balanced), null);
});

test('loadConfig reads the style from the environment: eager gives its pass mark and its tuning, and the policy\'s ceiling', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tab-recap-style-'));
    const saved = { style: process.env['TAB_RECAP_AUTOCOMPACT_STYLE'], dir: process.env['HERDR_PLUGIN_CONFIG_DIR'] };
    try {
        process.env['TAB_RECAP_AUTOCOMPACT_STYLE'] = 'eager';
        process.env['HERDR_PLUGIN_CONFIG_DIR'] = dir;
        const config = loadConfig();
        assert.deepEqual([config.tuning.style, config.tuning.coverageAtLeast, config.tuning.recheckIdleMs, config.autocompact.ceiling], ['eager', 0.60, 1_800_000, 65]);
    } finally {
        if (saved.style === undefined) delete process.env['TAB_RECAP_AUTOCOMPACT_STYLE']; else process.env['TAB_RECAP_AUTOCOMPACT_STYLE'] = saved.style;
        if (saved.dir === undefined) delete process.env['HERDR_PLUGIN_CONFIG_DIR']; else process.env['HERDR_PLUGIN_CONFIG_DIR'] = saved.dir;
        rmSync(dir, { recursive: true, force: true });
    }
});
