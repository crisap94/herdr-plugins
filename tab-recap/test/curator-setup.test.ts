import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { changes, draftFrom, initial, locksOf, step, withAvailable } from '#src/recap/application/setup-keys.ts';
import type { Setup } from '#src/recap/application/setup-keys.ts';
import { CURATE_DEFAULT, curateJobOf } from '#src/recap/domain/job.ts';
import { setupView } from '#src/recap/render/setup.ts';

const models = { claude: '', codex: 'gpt-6-luna', opencode: '', hermes: '', custom: '' };
const raw = { locale: undefined, recapLanguage: undefined };
const draft = draftFrom({ backend: 'codex', models }, raw);
const given = (key: string): string | undefined => ({ TAB_RECAP_CURATE_BY: ' Codex ', TAB_RECAP_CURATE_MODEL: ' gpt-6-luna ', TAB_RECAP_CURATE_EFFORT: 'HIGH' })[key];
const start = (locks = {}): Setup => withAvailable(initial(draft, locks), ['claude', 'codex']);
const down = (n: number): string[] => Array.from({ length: n }, () => 'j');
const typed = (state: Setup, keys: readonly string[]): Setup => keys.reduce((now, key) => step(now, key).state, state);

test('the curator job: as the recap writer, no model of its own and medium effort until set', () => {
    assert.deepEqual(CURATE_DEFAULT, { by: 'recap', model: '', effort: 'medium' });
    assert.deepEqual(draft.curate, CURATE_DEFAULT);
    assert.deepEqual(curateJobOf(given), { by: 'codex', model: 'gpt-6-luna', effort: 'high' });
    assert.deepEqual(curateJobOf((key) => (key.endsWith('_MODEL') ? undefined : 'nonsense')), { by: 'recap', model: '', effort: 'medium' }, 'unknown values are the defaults');
    assert.equal(curateJobOf((key) => (key === 'TAB_RECAP_CURATE_BY' ? 'off' : undefined)).by, 'off');
});

test('the curator row is the last, a job row: each part is edited and saved under its variable', () => {
    const row = typed(start(), down(10));
    assert.equal(row.row, 10);
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
    assert.deepEqual(locksOf({ TAB_RECAP_CURATE_BY: 'off', TAB_RECAP_CURATE_MODEL: 'x', TAB_RECAP_CURATE_EFFORT: 'low' }), { curateBy: 'TAB_RECAP_CURATE_BY', curateModel: 'TAB_RECAP_CURATE_MODEL', curateEffort: 'TAB_RECAP_CURATE_EFFORT' });
    assert.equal(typed(start({ curateModel: 'TAB_RECAP_CURATE_MODEL' }), [...down(10), 'l', '\r']).note, 'locked');
    assert.equal(typed(start({ curateModel: 'TAB_RECAP_CURATE_MODEL' }), [...down(10), 'l', 'l', '\r']).editing?.kind, 'choice', 'only the locked part');
});

test('the Models group draws the curator in both languages, explains itself while focused, and names its own off', () => {
    const english = setupView(start(), en, 100).join('\n');
    assert.match(english, /Curator\s+as the recap writer · the recap writer's model · medium/u);
    const spanish = setupView(start(), es, 100).join('\n');
    assert.match(spanish, /Curador\s+como el redactor · el modelo del redactor · medium/u);
    const focused = setupView(typed(start(), down(10)), en, 100).join('\n');
    assert.match(focused, /merges duplicate facts and writes the "session so far"/u);
    const choosing = setupView(typed(start(), [...down(10), '\r']), en, 100).join('\n');
    assert.match(choosing, /▸ as the recap writer — the same harness/u);
    assert.match(choosing, /off — no paragraph, no merges/u);
    assert.ok(!choosing.includes('off — compact with the template'));
    assert.match(setupView(typed(start(), [...down(10), '\r']), es, 100).join('\n'), /apagado — sin párrafo ni fusiones/u);
});

test('config: the curator job is read from TAB_RECAP_CURATE_BY / _MODEL / _EFFORT, defaulting to the recap writer at medium effort', async () => {
    const { loadConfig } = await import('#src/daemon/config.ts');
    const keys = ['TAB_RECAP_CURATE_BY', 'TAB_RECAP_CURATE_MODEL', 'TAB_RECAP_CURATE_EFFORT'];
    const was = keys.map((key) => process.env[key]);
    try {
        keys.forEach((key) => { delete process.env[key]; });
        assert.deepEqual(loadConfig().curator, { by: 'recap', model: '', effort: 'medium' });
        Object.assign(process.env, { TAB_RECAP_CURATE_BY: 'claude', TAB_RECAP_CURATE_MODEL: 'haiku', TAB_RECAP_CURATE_EFFORT: 'low' });
        assert.deepEqual(loadConfig().curator, { by: 'claude', model: 'haiku', effort: 'low' });
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
