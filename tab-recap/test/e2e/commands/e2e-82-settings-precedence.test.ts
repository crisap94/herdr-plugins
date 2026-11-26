import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { evalWorld, judgingWorld, type EvalWorld } from '../support/eval-world.ts';

const DESKTOP_ENTRY = join(import.meta.dirname, '..', '..', '..', 'bin', 'tab-recap-desktop.mjs');
const AUTO = 'auto (claude → codex → opencode)';
const CONFIG = 'config/config.env';

const CLEAR = {
    TAB_RECAP_BACKEND: '', TAB_RECAP_MODEL_CODEX: '', TAB_RECAP_MODEL_CLAUDE: '', TAB_RECAP_RECAP_LANG: '', TAB_RECAP_LOCALE: '',
    TAB_RECAP_COMPACT_HINT: '', TAB_RECAP_CONTEXT_WINDOW: '', TAB_RECAP_AUTOCOMPACT_AT: '', TAB_RECAP_JUDGE_BY: '', TAB_RECAP_JUDGE_MODEL: '', TAB_RECAP_JUDGE_EFFORT: '',
};

const fileOf = (world: EvalWorld, ...lines: readonly string[]): void => {
    world.write(CONFIG, lines.length === 0 ? '' : `${lines.join('\n')}\n`);
};

const lineOf = (text: string, name: string): string => text.split('\n').find((line) => line.startsWith(`${name} `))?.slice(name.length).trim() ?? '';

const statusLine = async (world: EvalWorld, name: string, env: Readonly<Record<string, string>> = {}): Promise<string> => {
    const ran = await world.run(['status'], { env });
    assert.equal(ran.code, 0, ran.stderr);
    return lineOf(ran.stdout, name);
};

const shown = async (world: EvalWorld, env: Readonly<Record<string, string>> = {}): Promise<Readonly<Record<string, string>>> => {
    const ran = await world.run(['settings'], { script: DESKTOP_ENTRY, env });
    assert.equal(ran.code, 0, ran.stderr);
    const parsed = JSON.parse(ran.stdout) as { readonly settings: readonly { readonly id: string; readonly value: string }[] };
    return Object.fromEntries(parsed.settings.map((setting) => [setting.id, setting.value]));
};

describe('a key set in the environment and in config.env', () => {
    let world: EvalWorld;

    before(() => {
        world = evalWorld({ judge: 'none' });
    });

    after(() => {
        world.close();
    });

    test('a key set only in config.env is used, and status shows it', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_BACKEND=codex', 'TAB_RECAP_MODEL_CODEX=gpt-file');
        assert.equal(await statusLine(world, 'backend'), 'codex/gpt-file');
    });

    test('a key set only in the environment is used', { timeout: 30_000 }, async () => {
        fileOf(world);
        assert.equal(await statusLine(world, 'backend', { TAB_RECAP_BACKEND: 'claude' }), 'claude');
    });

    test('the environment wins over config.env for the same key', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_BACKEND=codex');
        assert.equal(await statusLine(world, 'backend', { TAB_RECAP_BACKEND: 'claude' }), 'claude');
    });

    test('the environment wins over config.env for a model, key by key', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_BACKEND=codex', 'TAB_RECAP_MODEL_CODEX=gpt-file');
        assert.equal(await statusLine(world, 'backend', { TAB_RECAP_MODEL_CODEX: 'gpt-env' }), 'codex/gpt-env');
    });

    test('an empty environment value does not hide the key in config.env', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_BACKEND=codex');
        assert.equal(await statusLine(world, 'backend', { TAB_RECAP_BACKEND: '' }), 'codex');
    });

    test('the recap language is the exception: config.env wins over the environment and status names the source', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_RECAP_LANG=es');
        assert.equal(await statusLine(world, 'language', { TAB_RECAP_RECAP_LANG: 'fr' }), 'es (settings file)');
        fileOf(world);
        assert.equal(await statusLine(world, 'language', { TAB_RECAP_RECAP_LANG: 'fr' }), 'fr (environment variable)');
    });

    test('the interface language is the same exception: config.env wins over the environment', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_LOCALE=es');
        assert.equal(await statusLine(world, 'idioma', { TAB_RECAP_LOCALE: 'en' }), 'es (archivo de ajustes)');
    });
});

describe('a bad value falls back to the default and status shows the result', () => {
    let world: EvalWorld;

    before(() => {
        world = evalWorld({ judge: 'none' });
    });

    after(() => {
        world.close();
    });

    test('an unknown harness in the environment falls back to auto', { timeout: 30_000 }, async () => {
        fileOf(world);
        assert.equal(await statusLine(world, 'backend', { TAB_RECAP_BACKEND: 'nonsense' }), AUTO);
    });

    test('an unknown harness in config.env falls back to auto', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_BACKEND=nonsense');
        assert.equal(await statusLine(world, 'backend'), AUTO);
    });

    test('a bad value in the environment is not rescued by a good one in config.env', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_BACKEND=codex');
        assert.equal(await statusLine(world, 'backend', { TAB_RECAP_BACKEND: 'nonsense' }), AUTO);
    });
});

describe('a count setting', () => {
    let world: EvalWorld;

    before(() => {
        world = evalWorld({ judge: 'none' });
    });

    after(() => {
        world.close();
    });

    test('with nothing set, the hint is 40, the context window is empty and autocompact starts at 10', { timeout: 30_000 }, async () => {
        fileOf(world);
        const settings = await shown(world, CLEAR);
        assert.equal(settings['compactHint'], '40');
        assert.equal(settings['contextWindow'], '');
        assert.equal(settings['autocompactAt'], '10');
    });

    test('a whole number in config.env is used', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_COMPACT_HINT=25', 'TAB_RECAP_CONTEXT_WINDOW=200000', 'TAB_RECAP_AUTOCOMPACT_AT=30');
        const settings = await shown(world, CLEAR);
        assert.equal(settings['compactHint'], '25');
        assert.equal(settings['contextWindow'], '200000');
        assert.equal(settings['autocompactAt'], '30');
    });

    test('a whole number in the environment wins over config.env', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_COMPACT_HINT=25', 'TAB_RECAP_CONTEXT_WINDOW=200000', 'TAB_RECAP_AUTOCOMPACT_AT=30');
        const settings = await shown(world, { ...CLEAR, TAB_RECAP_COMPACT_HINT: '35', TAB_RECAP_CONTEXT_WINDOW: '100000', TAB_RECAP_AUTOCOMPACT_AT: '50' });
        assert.equal(settings['compactHint'], '35');
        assert.equal(settings['contextWindow'], '100000');
        assert.equal(settings['autocompactAt'], '50');
    });

    for (const [why, bad] of [['text', 'abc'], ['a fraction', '1.5'], ['negative', '-1'], ['empty', '']] as const) {
        test(`a bad value (${why}) falls back to the default for each count key`, { timeout: 30_000 }, async () => {
            fileOf(world, `TAB_RECAP_COMPACT_HINT=${bad}`, `TAB_RECAP_CONTEXT_WINDOW=${bad}`, `TAB_RECAP_AUTOCOMPACT_AT=${bad}`);
            const settings = await shown(world, CLEAR);
            assert.equal(settings['compactHint'], '40');
            assert.equal(settings['contextWindow'], '');
            assert.equal(settings['autocompactAt'], '10');
        });
    }

    test('zero is no context window', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_CONTEXT_WINDOW=0');
        assert.equal((await shown(world, CLEAR))['contextWindow'], '');
    });

    test('a bad value in the environment is not rescued by a good one in config.env', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_COMPACT_HINT=25');
        assert.equal((await shown(world, { ...CLEAR, TAB_RECAP_COMPACT_HINT: 'abc' }))['compactHint'], '40');
    });
});

describe('the judge job settings', () => {
    let world: EvalWorld;

    before(() => {
        world = evalWorld({ judge: 'none' });
    });

    after(() => {
        world.close();
    });

    test('with nothing set, the judge runs where the recap writer runs, at medium effort', { timeout: 30_000 }, async () => {
        fileOf(world);
        const settings = await shown(world, CLEAR);
        assert.deepEqual([settings['judgeBy'], settings['judgeModel'], settings['judgeEffort']], ['recap', '', 'medium']);
    });

    test('config.env sets the harness, model and effort, trimmed and in lower case', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_JUDGE_BY= Codex ', 'TAB_RECAP_JUDGE_MODEL= gpt-6-luna ', 'TAB_RECAP_JUDGE_EFFORT=HIGH');
        const settings = await shown(world, CLEAR);
        assert.deepEqual([settings['judgeBy'], settings['judgeModel'], settings['judgeEffort']], ['codex', 'gpt-6-luna', 'high']);
    });

    test('the environment wins over config.env for each of the three', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_JUDGE_BY=codex', 'TAB_RECAP_JUDGE_MODEL=gpt-6-luna', 'TAB_RECAP_JUDGE_EFFORT=high');
        const settings = await shown(world, { ...CLEAR, TAB_RECAP_JUDGE_BY: 'custom', TAB_RECAP_JUDGE_MODEL: 'm-env', TAB_RECAP_JUDGE_EFFORT: 'low' });
        assert.deepEqual([settings['judgeBy'], settings['judgeModel'], settings['judgeEffort']], ['custom', 'm-env', 'low']);
    });

    test('an unknown harness or effort falls back to the default', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_JUDGE_BY=nonsense', 'TAB_RECAP_JUDGE_EFFORT=max');
        const settings = await shown(world, CLEAR);
        assert.deepEqual([settings['judgeBy'], settings['judgeEffort']], ['recap', 'medium']);
    });

    test('off and default are kept as they are', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_JUDGE_BY=off', 'TAB_RECAP_JUDGE_EFFORT=default');
        const settings = await shown(world, CLEAR);
        assert.deepEqual([settings['judgeBy'], settings['judgeEffort']], ['off', 'default']);
    });
});

describe('eval follows the judge settings', () => {
    let world: EvalWorld;

    before(() => {
        world = judgingWorld();
        world.seed(1);
    });

    after(() => {
        world.close();
    });

    test('eval prints the judge with the model and effort the environment sets', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_JUDGE_MODEL=m-file', 'TAB_RECAP_JUDGE_EFFORT=low');
        const ran = await world.run(['eval'], { env: { TAB_RECAP_JUDGE_MODEL: 'm-env', TAB_RECAP_JUDGE_EFFORT: 'high' } });
        assert.equal(ran.code, 0, ran.stderr);
        assert.match(ran.stdout, /judge custom · m-env · high — 1 runs sampled, 1 judged/);
    });

    test('eval takes the model and effort from config.env when the environment sets none', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_JUDGE_MODEL=m-file', 'TAB_RECAP_JUDGE_EFFORT=low');
        const ran = await world.run(['eval']);
        assert.equal(ran.code, 0, ran.stderr);
        assert.match(ran.stdout, /judge custom · m-file · low — 1 runs sampled, 1 judged/);
    });

    test('a judge set to off has no harness: eval says so and exits 1', { timeout: 30_000 }, async () => {
        fileOf(world);
        const ran = await world.run(['eval'], { env: { TAB_RECAP_JUDGE_BY: 'off' } });
        assert.equal(ran.code, 1, ran.stderr);
        assert.match(ran.stderr, /no harness is available for the judge job/);
    });

    test('an unknown judge harness falls back to the recap writer\'s', { timeout: 30_000 }, async () => {
        fileOf(world, 'TAB_RECAP_JUDGE_BY=nonsense');
        const ran = await world.run(['eval']);
        assert.equal(ran.code, 0, ran.stderr);
        assert.match(ran.stdout, /judge custom · default · medium/);
    });
});
