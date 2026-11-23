import { catalogFor } from '#src/i18n/index.ts';
import { uncheckedAgentKind } from '#src/recap/domain/ids.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { test } from 'node:test';
import { curateJobOf } from './fakes/settings-readers.ts';
import assert from 'node:assert/strict';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { changes, draftFrom, initial, locksOf, step, withAvailable } from '#src/recap/application/setup-keys.ts';
import type { Setup } from '#src/recap/application/setup-keys.ts';
import { curatorFor } from '#src/daemon/backends.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { JobSetting } from '#src/recap/domain/job.ts';
import { HarnessCurator } from '#src/adapters/job/curator.ts';
import type { HarnessAsk, HarnessChoice, HarnessPort, HarnessRun, StructuredSupport } from '#src/ports/harness.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import { CURATE_DEFAULT } from '#src/recap/domain/job.ts';
import { setupLines } from '#src/recap/render/setup.ts';
import { fakeOutput, fakeRuntime } from '#test/fakes/harness-runtime.ts';
import { parseText, textOf } from '#src/recap/domain/text.ts';
import { readerOf } from '#test/fakes/environment.ts';

const models = { claude: textOf(''), codex: textOf('gpt-6-luna'), opencode: textOf(''), custom: textOf('') };
const raw = { locale: undefined, recapLanguage: undefined };
const draft = draftFrom({ backend: 'codex', models }, raw);
const given = (key: string): string | undefined => ({ TAB_RECAP_CURATE_BY: ' Codex ', TAB_RECAP_CURATE_MODEL: ' gpt-6-luna ', TAB_RECAP_CURATE_EFFORT: 'HIGH' })[key];
const start = (locks = {}): Setup => withAvailable(initial(draft, locks), [uncheckedAgentKind('claude'), uncheckedAgentKind('codex')]);
const down = (n: number): string[] => Array.from({ length: n }, () => 'j');
const typed = (state: Setup, keys: readonly string[]): Setup => keys.reduce((now, key) => step(now, textOf(key)).state, state);

test('the curator job: as the recap writer, no model of its own and medium effort until set', () => {
    assert.deepEqual(CURATE_DEFAULT, { by: 'recap', model: '', effort: 'medium' });
    assert.deepEqual(draft.curate, CURATE_DEFAULT);
    assert.deepEqual(curateJobOf(given), { by: 'codex', model: 'gpt-6-luna', effort: 'high' });
    assert.deepEqual(curateJobOf((key) => (key.endsWith('_MODEL') ? undefined : 'nonsense')), { by: 'recap', model: '', effort: 'medium' }, 'unknown values are the defaults');
    assert.equal(curateJobOf((key) => (key === 'TAB_RECAP_CURATE_BY' ? 'off' : undefined)).by, 'off');
});

const timed = (value: string): JobSetting => curateJobOf((key) => (key === 'TAB_RECAP_CURATE_TIMEOUT_MS' ? value : undefined));

test('the curator time limit: TAB_RECAP_CURATE_TIMEOUT_MS sets a positive whole number of milliseconds; anything else leaves the key out', () => {
    assert.deepEqual(curateJobOf(() => undefined), CURATE_DEFAULT);
    assert.deepEqual(timed('90000'), { ...CURATE_DEFAULT, timeoutMs: 90000 });
    for (const value of ['0', '-5', 'abc', '1.5', '']) {
        assert.equal('timeoutMs' in timed(value), false, value);
    }
});

const CURATOR_KEYS = ['TAB_RECAP_BACKEND', 'TAB_RECAP_CLAUDE_POLICY_ACK', 'TAB_RECAP_CURATE_TIMEOUT_MS'];

async function curatorLimit(limit: string | undefined): Promise<unknown> {
    const { loadSettings } = await import('#src/daemon/config.ts');
    const was = CURATOR_KEYS.map((key) => process.env[key]);
    try {
        Object.assign(process.env, { TAB_RECAP_BACKEND: 'claude', TAB_RECAP_CLAUDE_POLICY_ACK: 'on' });
        if (limit === undefined) {
            delete process.env['TAB_RECAP_CURATE_TIMEOUT_MS'];
        } else {
            process.env['TAB_RECAP_CURATE_TIMEOUT_MS'] = limit;
        }
        const runtime = fakeRuntime({ scripts: { claude: [fakeOutput({ text: 'ok' }), fakeOutput({ text: 'ok' })] } });
        await curatorFor(loadSettings(), ['claude'], must(parseDirectory('work')), runtime)?.write(must(parseText('document')));
        const request = runtime.calls[0]?.request;
        return request === undefined ? undefined : { has: 'timeoutMs' in request, value: request.timeoutMs };
    } finally {
        for (const [at, key] of CURATOR_KEYS.entries()) {
            const before = was[at];
            if (before === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = before;
            }
        }
    }
}

test('the curator call gets the time limit when TAB_RECAP_CURATE_TIMEOUT_MS sets one, and no limit of its own when it does not', async () => {
    assert.deepEqual(await curatorLimit('90000'), { has: true, value: 90000 });
    assert.deepEqual(await curatorLimit(undefined), { has: false, value: undefined });
});

test('the curator row is the last, a job row: each part is edited and saved under its variable', () => {
    const row = typed(start(), down(11));
    assert.equal(row.row, 11);
    assert.equal(typed(row, ['l']).part, 1, 'it has parts, like the other jobs');
    const off = typed(row, ['\r', 'k', '\r']);
    assert.equal(off.draft.curate.by, 'off', 'the list wraps to off');
    assert.deepEqual([...changes(off)], [['TAB_RECAP_CURATE_BY', 'off']]);
    const model = typed(row, ['l', '\r', 's', 'o', 'n', 'n', 'e', 't', '\r']);
    assert.deepEqual([...changes(model)], [['TAB_RECAP_CURATE_MODEL', 'sonnet']]);
    const effort = typed(row, ['l', 'l', '\r', 'j', '\r']);
    assert.deepEqual([...changes(effort)], [['TAB_RECAP_CURATE_EFFORT', 'high']]);
});

test('a curator part an environment variable sets is read-only and says which', () => {
    assert.deepEqual(locksOf(readerOf({ TAB_RECAP_CURATE_BY: 'off', TAB_RECAP_CURATE_MODEL: 'x', TAB_RECAP_CURATE_EFFORT: 'low' })), { curateBy: 'TAB_RECAP_CURATE_BY', curateModel: 'TAB_RECAP_CURATE_MODEL', curateEffort: 'TAB_RECAP_CURATE_EFFORT' });
    assert.equal(typed(start({ curateModel: 'TAB_RECAP_CURATE_MODEL' }), [...down(11), 'l', '\r']).note, 'locked');
    assert.equal(typed(start({ curateModel: 'TAB_RECAP_CURATE_MODEL' }), [...down(11), 'l', 'l', '\r']).editing?.kind, 'choice', 'only the locked part');
});

test('the Models group draws the curator in both languages, explains itself while focused, and names its own off', () => {
    const english = setupLines(start(), catalogFor(en.locale), countOf(100)).join('\n');
    assert.match(english, /Curator\s+as the recap writer · the recap writer's model · medium/u);
    const spanish = setupLines(start(), catalogFor(es.locale), countOf(100)).join('\n');
    assert.match(spanish, /Curador\s+como el redactor · el modelo del redactor · medium/u);
    const focused = setupLines(typed(start(), down(11)), catalogFor(en.locale), countOf(100)).join('\n');
    assert.match(focused, /merges duplicate facts and writes the "session so far"/u);
    const choosing = setupLines(typed(start(), [...down(11), '\r']), catalogFor(en.locale), countOf(100)).join('\n');
    assert.match(choosing, /▸ as the recap writer — the same harness/u);
    assert.match(choosing, /off — no paragraph, no merges/u);
    assert.ok(!choosing.includes('off — compact with the template'));
    assert.match(setupLines(typed(start(), [...down(11), '\r']), catalogFor(es.locale), countOf(100)).join('\n'), /apagado — sin párrafo ni fusiones/u);
});

test('config: the curator job is read from TAB_RECAP_CURATE_BY / _MODEL / _EFFORT, defaulting to the recap writer at medium effort', async () => {
    const { loadSettings } = await import('#src/daemon/config.ts');
    const keys = ['TAB_RECAP_CURATE_BY', 'TAB_RECAP_CURATE_MODEL', 'TAB_RECAP_CURATE_EFFORT'];
    const was = keys.map((key) => process.env[key]);
    try {
        keys.forEach((key) => { delete process.env[key]; });
        assert.deepEqual(loadSettings().curator, { by: 'recap', model: '', effort: 'medium' });
        Object.assign(process.env, { TAB_RECAP_CURATE_BY: 'claude', TAB_RECAP_CURATE_MODEL: 'haiku', TAB_RECAP_CURATE_EFFORT: 'low' });
        assert.deepEqual(loadSettings().curator, { by: 'claude', model: 'haiku', effort: 'low' });
    } finally {
        keys.forEach((key, at) => {
            const value = was[at];
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        });
    }
});

const answerOf = (value: string | undefined): JobSetting => curateJobOf((key) => (key === 'TAB_RECAP_CURATE_ANSWER' ? value : undefined));

test('the curator answer: TAB_RECAP_CURATE_ANSWER set to schema (trimmed, any case) asks for a schema answer; any other value, or none, keeps the text route', () => {
    assert.deepEqual(answerOf(' Schema '), { ...CURATE_DEFAULT, answer: 'schema' });
    for (const value of ['text', 'json', '', undefined]) {
        assert.equal('answer' in answerOf(value), false, String(value));
    }
    assert.deepEqual(curateJobOf(() => undefined), CURATE_DEFAULT);
});

function recordingHarness(structured: StructuredSupport | undefined): { readonly harness: HarnessPort; readonly calls: HarnessAsk[] } {
    const calls: HarnessAsk[] = [];
    const ran: HarnessRun = { kind: 'ran', text: textOf('ok'), costUsd: must(parseUsd(0)) };
    const harness: HarnessPort = {
        id: textOf('fake'),
        label: () => textOf('fake'),
        limit: null,
        ...(structured === undefined ? {} : { structured }),
        run: (call) => {
            calls.push(call);
            return Promise.resolve(ran);
        },
    };
    return { harness, calls };
}

const settings: HarnessChoice = { model: textOf('m'), effort: 'low' };

test('the curator asks for a schema answer only when it was asked for and the harness supports schema, in the mode it was given', async () => {
    const schema = recordingHarness('schema');
    await new HarnessCurator(schema.harness, settings, 'schema').write(must(parseText('document')), 'reconcile');
    assert.deepEqual(schema.calls[0]?.answer, { kind: 'schema', schema: 'reconcile' });
    const unsupported = recordingHarness(undefined);
    await new HarnessCurator(unsupported.harness, settings, 'schema').write(must(parseText('document')));
    assert.equal(unsupported.calls.length, 1);
    assert.equal('answer' in (unsupported.calls[0] ?? {}), false);
    const text = recordingHarness('schema');
    await new HarnessCurator(text.harness, settings, 'text').write(must(parseText('document')));
    assert.equal(text.calls.length, 1);
    assert.equal('answer' in (text.calls[0] ?? {}), false);
});
