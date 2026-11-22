import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coverageDeciderFor, coverageDeciderPortFor, deciderFor, deciderPortFor } from '#src/daemon/deciders.ts';
import { loadConfig } from '#src/daemon/config.ts';
import type { Decider, DeciderPort, Noul } from '#src/ports/decider.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { fakeOutput, fakeRuntime } from '#test/fakes/harness-runtime.ts';
import { documentOf, noulOf, textOf } from './fakes/decider-fixtures.ts';

const WORK = must(parseDirectory('/work'));
const QUESTIONS: ReadonlyMap<Text, Noul> = new Map([[textOf('q'), noulOf('is it so?', 'yes', 'no')]]);
const REPLY = { model: 'jev-1.13.0', answers: { q: { noul: 0.8 } }, usage: { input_tokens: 12.5 } };

interface Config {
    readonly name: string;
    readonly env: Readonly<Record<string, string>>;
    readonly available: readonly BackendId[];
}

const CONFIGS: readonly Config[] = [
    { name: 'a harness decider', env: { TAB_RECAP_AUTOCOMPACT_BY: 'recap' }, available: ['claude'] },
    { name: 'a harness decider with nothing installed', env: { TAB_RECAP_AUTOCOMPACT_BY: 'recap' }, available: [] },
    { name: 'the decider off', env: { TAB_RECAP_AUTOCOMPACT_BY: 'off' }, available: ['claude'] },
    { name: 'jev', env: { TAB_RECAP_AUTOCOMPACT_BY: 'jev', TAB_RECAP_JEV_KEY: 'sk-wiring' }, available: [] },
    { name: 'jev without a key', env: { TAB_RECAP_AUTOCOMPACT_BY: 'jev' }, available: [] },
    { name: 'coverage auto with a key', env: { TAB_RECAP_AUTOCOMPACT_BY: 'recap', TAB_RECAP_JEV_KEY: 'sk-wiring' }, available: ['claude'] },
    { name: 'coverage auto with no backend and no key', env: { TAB_RECAP_AUTOCOMPACT_BY: 'recap' }, available: [] },
    { name: 'coverage on its own model', env: { TAB_RECAP_AUTOCOMPACT_BY: 'claude', TAB_RECAP_AUTOCOMPACT_COVERAGE_BY: 'decider', TAB_RECAP_AUTOCOMPACT_COVERAGE_MODEL: 'claude-haiku-5-5', TAB_RECAP_AUTOCOMPACT_COVERAGE_EFFORT: 'medium' }, available: ['claude'] },
    { name: 'coverage jev', env: { TAB_RECAP_AUTOCOMPACT_BY: 'recap', TAB_RECAP_AUTOCOMPACT_COVERAGE_BY: 'jev', TAB_RECAP_JEV_KEY: 'sk-wiring' }, available: ['claude'] },
];

type Build = (config: ReturnType<typeof loadConfig>, available: readonly BackendId[], runtime: ReturnType<typeof fakeRuntime>) => Decider | DeciderPort | null;

const LEGACY: Readonly<Record<'decider' | 'coverage', Build>> = {
    decider: (config, available, runtime) => deciderFor(config, available, WORK, runtime),
    coverage: (config, available, runtime) => coverageDeciderFor(config, available, WORK, runtime),
};

const TYPED: Readonly<Record<'decider' | 'coverage', Build>> = {
    decider: (config, available, runtime) => deciderPortFor(config, available, WORK, runtime),
    coverage: (config, available, runtime) => coverageDeciderPortFor(config, available, WORK, runtime),
};

async function answered(build: Build, setting: Config): Promise<{ readonly label: Text | null; readonly answer: unknown }> {
    const dir = mkdtempSync(join(tmpdir(), 'decider-port-wiring-'));
    const home = mkdtempSync(join(tmpdir(), 'decider-port-home-'));
    const keys = ['HERDR_PLUGIN_CONFIG_DIR', 'HOME', 'TAB_RECAP_BACKEND', 'TAB_RECAP_JEV_KEY', 'TYPESAFE_API_KEY', 'TAB_RECAP_AUTOCOMPACT_BY', 'TAB_RECAP_AUTOCOMPACT_COVERAGE_BY', 'TAB_RECAP_AUTOCOMPACT_COVERAGE_MODEL', 'TAB_RECAP_AUTOCOMPACT_COVERAGE_EFFORT', 'TAB_RECAP_CLAUDE_POLICY_ACK'];
    const was = keys.map((key) => process.env[key]);
    keys.forEach((key) => { delete process.env[key]; });
    const realFetch = globalThis.fetch;
    const posted: string[] = [];
    globalThis.fetch = ((_url: string, init: RequestInit): Promise<Response> => { posted.push(JSON.stringify(init.body)); return Promise.resolve(new Response(JSON.stringify(REPLY))); }) as unknown as typeof fetch;
    Object.assign(process.env, { HERDR_PLUGIN_CONFIG_DIR: dir, HOME: home, TAB_RECAP_BACKEND: 'auto', TAB_RECAP_CLAUDE_POLICY_ACK: 'on', ...setting.env });
    try {
        const runtime = fakeRuntime({ scripts: { claude: [fakeOutput({ text: '{"q":0.8}' }), fakeOutput({ text: '{"q":0.8}' })] } });
        const decider = build(loadConfig(), setting.available, runtime);
        if (decider === null) return { label: null, answer: null };
        const found = await decider.ask(documentOf({}), QUESTIONS);
        const { tookMs: _ignored, ...rest } = found.kind === 'decided' ? { ...found, answers: Object.fromEntries(found.answers) } : { ...found, tookMs: 0 };
        return { label: decider.label, answer: { ...rest, posted: posted.length, calls: runtime.calls.length } };
    } finally {
        globalThis.fetch = realFetch;
        keys.forEach((key, at) => { const before = was[at]; if (before === undefined) { delete process.env[key]; } else { process.env[key] = before; } });
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
    }
}

for (const job of ['decider', 'coverage'] as const) {
    for (const setting of CONFIGS) {
        test(`${job}PortFor gives what ${job === 'decider' ? 'deciderFor' : 'coverageDeciderFor'} gives for ${setting.name}: null together, the same label, the same answers`, async () => {
            const legacy = await answered(LEGACY[job], setting);
            const typed = await answered(TYPED[job], setting);
            assert.deepEqual(typed, legacy);
        });
    }
}

test('a fractional Jev token count survives the typed port', async () => {
    const found = await answered(TYPED.decider, CONFIGS[3] as Config);
    assert.deepEqual((found.answer as { tokens: number }).tokens, 12.5);
});

test('a harness decider answers through the typed port with the probabilities the harness said', async () => {
    const found = await answered(TYPED.decider, CONFIGS[0] as Config);
    assert.deepEqual((found.answer as { kind: string; answers: unknown }).answers, { q: 0.8 });
});
