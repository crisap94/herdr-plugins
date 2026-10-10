import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changes, dirty, draftFrom, initial, locksOf, modelTarget, saved, step, tested, withAvailable } from '#src/recap/application/setup-keys.ts';
import type { Draft, Effect, Locks, Setup } from '#src/recap/application/setup-keys.ts';

const ESC = String.fromCodePoint(0x1b);
const models = { claude: '', codex: 'gpt-6-luna', opencode: '', hermes: '', custom: '' };
const draft: Draft = draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined });

function typed(state: Setup, keys: readonly string[]): { state: Setup; effects: Effect[] } {
    const effects: Effect[] = [];
    let now = state;
    for (const key of keys) {
        const stepped = step(now, key);
        now = stepped.state;
        effects.push(...stepped.effects);
    }
    return { state: now, effects };
}

const start = (locks: Locks = {}): Setup => withAvailable(initial(draft, locks), ['claude', 'codex']);
const down = (n: number): string[] => Array.from({ length: n }, () => 'j');

test('the draft starts from the configuration: auto UI, recap language follows the UI', () => {
    assert.deepEqual([draft.locale, draft.recapLanguage], ['auto', 'ui']);
    assert.equal(dirty(start()), false);
    assert.equal(changes(start()).size, 0);
});

test('navigation: j/k and arrows move between the eighteen rows and stop at the ends', () => {
    assert.equal(typed(start(), ['k', 'k']).state.row, 0);
    assert.equal(typed(start(), ['j', `${ESC}[B`]).state.row, 2);
    assert.equal(typed(start(), down(20)).state.row, 17);
    assert.equal(typed(start(), [...down(3), 'k', `${ESC}[A`]).state.row, 1);
});

test('harness: ⏎ opens the choices, j/k choose, ⏎ confirms, Esc cancels', () => {
    const chosen = typed(start(), ['\r', 'j', '\r']).state;
    assert.equal(chosen.draft.backend, 'opencode');
    assert.equal(chosen.editing, null);
    assert.deepEqual([...changes(chosen)], [['TAB_RECAP_BACKEND', 'opencode']]);
    assert.equal(typed(start(), ['\r', 'j', ESC]).state.draft.backend, 'codex');
    assert.equal(typed(start(), ['\r', 'k', 'k', 'k', '\r']).state.draft.backend, 'custom', 'wraps around the list');
});

test('model: edits the model of the harness in force; with auto that is the first available one', () => {
    const edited = typed(start(), ['l', '\r', '\u0015', 'g', 'p', 't', '-', '6', '\r']).state;
    assert.equal(edited.draft.models.codex, 'gpt-6');
    assert.deepEqual([...changes(edited)], [['TAB_RECAP_MODEL_CODEX', 'gpt-6']]);
    const auto = withAvailable(initial({ ...draft, backend: 'auto' }, {}), ['hermes', 'codex']);
    assert.equal(modelTarget(auto.draft, auto.available), 'codex');
    const none = withAvailable(initial({ ...draft, backend: 'auto' }, {}), []);
    assert.equal(typed(none, ['l', '\r']).state.note, 'no-agent');
    assert.equal(modelTarget({ ...draft, backend: 'custom' }, ['claude']), null);
});

test('text rows: backspace and ctrl-u; typing ‘q’, ‘s’ or ‘t’ is text while editing, not a command', () => {
    const state = typed(start(), ['l', '\r', '\u007f', 'q', 's', 't']).state;
    assert.equal(state.editing?.kind === 'text' ? state.editing.buffer : null, 'gpt-6-lunqst');
});

test('interface language: auto · en · es; recap language: ui · en · es · free text, sanitised', () => {
    const es = typed(start(), [...down(2), '\r', 'j', 'j', '\r']).state;
    assert.equal(es.draft.locale, 'es');
    const free = typed(start(), [...down(3), '\r', '\u0015', 'P', 'o', 'r', 't', 'u', 'g', 'u', 'ê', 's', '!', '\r']).state;
    assert.equal(free.draft.recapLanguage, 'Português');
    const mapped = typed(start(), [...down(3), '\r', '\u0015', 'S', 'p', 'a', 'n', 'i', 's', 'h', '\r']).state;
    assert.equal(mapped.draft.recapLanguage, 'es');
    const empty = typed(start(), [...down(3), '\r', '\u0015', '\r']).state;
    assert.equal(empty.draft.recapLanguage, 'ui');
});

test('a row an environment variable overrides is read-only and says which variable', () => {
    const locks = locksOf({ TAB_RECAP_WORDS: '300', TAB_RECAP_MODEL_CODEX: 'x', TAB_RECAP_LOCALE: 'es', TAB_RECAP_BACKEND: '' });
    assert.deepEqual(locks, { model: 'TAB_RECAP_MODEL_CODEX', locale: 'TAB_RECAP_LOCALE' }, 'the retired TAB_RECAP_WORDS locks nothing');
    const locked = typed(start(locks), ['l', '\r']).state;
    assert.equal(locked.editing, null);
    assert.equal(locked.note, 'locked');
    const forced = { ...start(locks), draft: { ...draft, locale: 'en' as const, models: { ...draft.models, codex: 'other' } } };
    assert.equal(changes(forced).size, 0, 'a locked row is never written');
});

test('t starts one test with the draft; a second t while it runs does nothing; the result comes back', () => {
    const first = typed(start(), ['t']);
    assert.deepEqual(first.effects.map((effect) => effect.kind), ['test']);
    assert.equal(first.state.test.kind, 'running');
    assert.equal(typed(first.state, ['t']).effects.length, 0);
    assert.equal(tested(first.state, { kind: 'ok', seconds: 2, costUsd: 0 }).test.kind, 'ok');
});

test('s saves only what changed, and asks for a rewrite when the recap language moves', () => {
    assert.equal(typed(start(), ['s']).state.note, 'nothing');
    const changed = typed(start(), [...down(3), '\r', '\u0015', 'e', 's', '\r']).state;
    const { effects } = typed(changed, ['s']);
    assert.deepEqual(effects, [{ kind: 'save', values: new Map([['TAB_RECAP_RECAP_LANG', 'es']]), languageChanged: true }]);
    const after = saved(changed, null, true);
    assert.equal(dirty(after), false);
    assert.equal(after.note, 'rewriting');
    assert.equal(saved(changed, 'disk full', false).note !== 'saved', true);
    const locale = typed(start(), [...down(2), '\r', 'j', 'j', '\r', 's']).effects;
    assert.deepEqual(locale, [{ kind: 'save', values: new Map([['TAB_RECAP_LOCALE', 'es']]), languageChanged: true }]);
});

test('q: closes at once when clean; with unsaved changes asks once, then a second q discards, any other key takes it back', () => {
    assert.deepEqual(typed(start(), ['q']).effects, [{ kind: 'close' }]);
    assert.deepEqual(typed(start(), [ESC]).effects, [{ kind: 'close' }]);
    const dirtied = typed(start(), ['\r', 'j', '\r']).state;
    const asked = typed(dirtied, ['q']);
    assert.equal(asked.state.note, 'unsaved');
    assert.equal(asked.effects.length, 0);
    assert.deepEqual(typed(asked.state, ['q']).effects, [{ kind: 'close' }]);
    const retracted = typed(asked.state, ['j', 'q']);
    assert.equal(retracted.effects.length, 0, 'the question is asked again, not skipped');
});

test('the modal is split into state, changes and keys; the keys module still presents all three', async () => {
    const keys = await import('#src/recap/application/setup-keys.ts');
    const changesModule = await import('#src/recap/application/setup-changes.ts');
    const state = await import('#src/recap/application/setup-state.ts');
    assert.equal(keys.changes, changesModule.changes);
    assert.equal(keys.locksOf, changesModule.locksOf);
    assert.equal(keys.dirty, changesModule.dirty);
    assert.equal(keys.ROWS, state.ROWS);
    assert.equal(keys.initial, state.initial);
});

test('screen agents: the fifth row takes a list or `all`, keeps only plain names, and writes TAB_RECAP_SCREEN_AGENTS', () => {
    assert.equal(draft.screenAgents, '', 'none by default');
    const typedList = typed(start(), [...down(4), '\r', 'G', 'e', 'm', 'i', 'n', 'i', ', ', 'q', 'w', 'e', 'n', '!', '\r']).state;
    assert.equal(typedList.draft.screenAgents, 'gemini,qwen');
    assert.deepEqual([...changes(typedList)], [['TAB_RECAP_SCREEN_AGENTS', 'gemini,qwen']]);
    const all = typed(start(), [...down(4), '\r', 'A', 'l', 'L', '\r']).state;
    assert.equal(all.draft.screenAgents, 'all');
    const cleared = typed({ ...typedList, stored: typedList.draft }, ['\r', '\u0015', '\r']).state;
    assert.deepEqual([...changes(cleared)], [['TAB_RECAP_SCREEN_AGENTS', '']], 'emptying it writes an empty value (none)');
    const locked = typed(start({ screenAgents: 'TAB_RECAP_SCREEN_AGENTS' }), [...down(4), '\r']).state;
    assert.equal(locked.note, 'locked');
    assert.deepEqual(locksOf({ TAB_RECAP_SCREEN_AGENTS: 'all' }), { screenAgents: 'TAB_RECAP_SCREEN_AGENTS' });
});

test('the git note row: on by default, a choice list, saved as TAB_RECAP_GIT_NOTE, read-only when the variable is set', () => {
    assert.equal(draft.gitNote, 'on');
    assert.equal(draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined, gitNote: ' OFF ' }).gitNote, 'off');
    assert.equal(draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined, gitNote: 'maybe' }).gitNote, 'on');
    const off = typed(start(), [...down(5), '\r', 'j', '\r']);
    assert.equal(off.state.draft.gitNote, 'off');
    assert.deepEqual([...changes(off.state)], [['TAB_RECAP_GIT_NOTE', 'off']]);
    assert.deepEqual(locksOf({ TAB_RECAP_GIT_NOTE: 'off' }), { gitNote: 'TAB_RECAP_GIT_NOTE' });
    assert.equal(typed(start({ gitNote: 'TAB_RECAP_GIT_NOTE' }), [...down(5), '\r']).state.note, 'locked');
});

test('job telemetry tags: off by default, saved as TAB_RECAP_TELEMETRY_TAGS, read-only when the variable is set', () => {
    assert.equal(draft.telemetryTags, 'off');
    assert.equal(draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined, telemetryTags: ' ON ' }).telemetryTags, 'on');
    assert.equal(draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined, telemetryTags: 'maybe' }).telemetryTags, 'off');
    const on = typed(start(), [...down(17), '\r', 'k', '\r']);
    assert.equal(on.state.draft.telemetryTags, 'on');
    assert.deepEqual([...changes(on.state)], [['TAB_RECAP_TELEMETRY_TAGS', 'on']]);
    assert.deepEqual(locksOf({ TAB_RECAP_TELEMETRY_TAGS: 'on' }), { telemetryTags: 'TAB_RECAP_TELEMETRY_TAGS' });
    const locked = typed(start({ telemetryTags: 'TAB_RECAP_TELEMETRY_TAGS' }), [...down(17), '\r']).state;
    assert.equal(locked.note, 'locked');
    assert.deepEqual([...changes(locked)], []);
});

test('the effort row: medium by default, a choice list, saved as TAB_RECAP_EFFORT, read-only when the variable is set', () => {
    assert.equal(draft.effort, 'medium');
    assert.equal(draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined, effort: ' HIGH ' }).effort, 'high');
    assert.equal(draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined, effort: 'max' }).effort, 'medium');
    const high = typed(start(), ['l', 'l', '\r', 'j', '\r']);
    assert.equal(high.state.draft.effort, 'high');
    assert.deepEqual([...changes(high.state)], [['TAB_RECAP_EFFORT', 'high']]);
    assert.deepEqual(locksOf({ TAB_RECAP_EFFORT: 'high' }), { effort: 'TAB_RECAP_EFFORT' });
    assert.equal(typed(start({ effort: 'TAB_RECAP_EFFORT' }), ['l', 'l', '\r']).state.note, 'locked');
});

test('the compaction rows: target, hint (40 by default, 10–95 or off) and window (empty = found at runtime), each saved under its variable and read-only when it is set', () => {
    assert.deepEqual([draft.compactTarget, draft.compactHint, draft.contextWindow], ['focused', '40', '']);
    const raw = { locale: undefined, recapLanguage: undefined };
    assert.deepEqual(draftFrom({ backend: 'codex', models }, { ...raw, compactTarget: ' Claude, codex ', compactHint: '60%', contextWindow: '1_000_000' }).compactTarget, 'claude,codex');
    assert.equal(draftFrom({ backend: 'codex', models }, { ...raw, compactHint: '5' }).compactHint, '40', 'out of range is the default');
    assert.equal(draftFrom({ backend: 'codex', models }, { ...raw, compactHint: 'OFF' }).compactHint, 'off');
    assert.equal(draftFrom({ backend: 'codex', models }, { ...raw, contextWindow: '1_000_000' }).contextWindow, '1000000');
    const target = typed(start(), [...down(6), '\r', '\u0015', 'a', 'l', 'l', '\r']).state;
    assert.deepEqual([...changes(target)], [['TAB_RECAP_COMPACT_TARGET', 'all']]);
    const hint = typed(start(), [...down(8),'\r', '\u0015', '5', '5', '\r']).state;
    assert.deepEqual([...changes(hint)], [['TAB_RECAP_COMPACT_HINT', '55']]);
    assert.equal(typed(hint, ['\r', '\u0015', '3', '\r']).state.draft.compactHint, '40', 'a value out of range falls back to the default');
    assert.equal(typed(hint, ['\r', '\u0015', 'o', 'f', 'f', '\r']).state.draft.compactHint, 'off');
    const window = typed(start(), [...down(9),'\r', '3', '0', '0', '0', '0', '0', '\r']).state;
    assert.deepEqual([...changes(window)], [['TAB_RECAP_CONTEXT_WINDOW', '300000']]);
    assert.equal(typed(window, ['\r', '\u0015', '\r']).state.draft.contextWindow, '', 'emptied: detect at runtime');
    assert.deepEqual(locksOf({ TAB_RECAP_COMPACT_TARGET: 'all', TAB_RECAP_COMPACT_HINT: 'off', TAB_RECAP_CONTEXT_WINDOW: '1' }), { compactTarget: 'TAB_RECAP_COMPACT_TARGET', compactHint: 'TAB_RECAP_COMPACT_HINT', contextWindow: 'TAB_RECAP_CONTEXT_WINDOW' });
    assert.equal(typed(start({ compactHint: 'TAB_RECAP_COMPACT_HINT' }), [...down(8),'\r']).state.note, 'locked');
});

test('the Models group: ←/→ walk the harness · model · effort of a job row, and do nothing elsewhere', () => {
    assert.equal(typed(start(), ['l', 'l', 'l']).state.part, 2, 'stops at the last part');
    assert.equal(typed(start(), ['l', 'l', 'h', 'h', 'h']).state.part, 0, 'stops at the first');
    assert.equal(typed(start(), [`${ESC}[C`, `${ESC}[C`, `${ESC}[D`]).state.part, 1, 'arrows work too');
    assert.equal(typed(start(), [...down(2), 'l']).state.part, 0, 'a row that is not a job has no parts');
    assert.equal(typed(start(), ['j', 'l']).state.part, 1, 'the compact job has them too');
});

test('the compact brief job: as the recap writer, no model of its own and high effort until set; each part is edited and saved under its variable', () => {
    assert.deepEqual(draft.compact, { by: 'recap', model: '', effort: 'high' });
    const raw = { locale: undefined, recapLanguage: undefined };
    assert.deepEqual(draftFrom({ backend: 'codex', models }, { ...raw, compactBy: ' Claude ', compactModel: ' sonnet ', compactEffort: 'MEDIUM' }).compact, { by: 'claude', model: 'sonnet', effort: 'medium' });
    assert.deepEqual(draftFrom({ backend: 'codex', models }, { ...raw, compactBy: 'nonsense', compactEffort: 'max' }).compact, { by: 'recap', model: '', effort: 'high' }, 'invalid values are the defaults');
    const by = typed(start(), ['j', '\r', 'j', 'j', '\r']).state;
    assert.equal(by.draft.compact.by, 'claude', 'recap → auto → claude');
    assert.deepEqual([...changes(by)], [['TAB_RECAP_COMPACT_BY', 'claude']]);
    const off = typed(start(), ['j', '\r', 'k', '\r']).state;
    assert.equal(off.draft.compact.by, 'off', 'the list wraps to off');
    const model = typed(start(), ['j', 'l', '\r', 's', 'o', 'n', 'n', 'e', 't', '\r']).state;
    assert.deepEqual([...changes(model)], [['TAB_RECAP_COMPACT_MODEL', 'sonnet']]);
    assert.equal(typed(model, ['\r', '\u0015', '\r']).state.draft.compact.model, '', 'emptied: the harness\'s configured model');
    const effort = typed(start(), ['j', 'l', 'l', '\r', 'k', '\r']).state;
    assert.deepEqual([...changes(effort)], [['TAB_RECAP_COMPACT_EFFORT', 'medium']]);
    assert.deepEqual(locksOf({ TAB_RECAP_COMPACT_BY: 'off', TAB_RECAP_COMPACT_MODEL: 'x', TAB_RECAP_COMPACT_EFFORT: 'low' }), { compactBy: 'TAB_RECAP_COMPACT_BY', compactModel: 'TAB_RECAP_COMPACT_MODEL', compactEffort: 'TAB_RECAP_COMPACT_EFFORT' });
    assert.equal(typed(start({ compactModel: 'TAB_RECAP_COMPACT_MODEL' }), ['j', 'l', '\r']).state.note, 'locked');
    assert.equal(typed(start({ compactModel: 'TAB_RECAP_COMPACT_MODEL' }), ['j', 'l', 'l', '\r']).state.editing?.kind, 'choice', 'only the locked part is read-only');
});

test('the judge job: as the recap writer, no model of its own and medium effort until set; each part is edited and saved under its variable, read-only when set', () => {
    assert.deepEqual(draft.judge, { by: 'recap', model: '', effort: 'medium' });
    const raw = { locale: undefined, recapLanguage: undefined };
    assert.deepEqual(draftFrom({ backend: 'codex', models }, { ...raw, judgeBy: ' Codex ', judgeModel: ' gpt-6-luna ', judgeEffort: 'HIGH' }).judge, { by: 'codex', model: 'gpt-6-luna', effort: 'high' });
    assert.deepEqual(draftFrom({ backend: 'codex', models }, { ...raw, judgeBy: 'nonsense', judgeEffort: 'max' }).judge, { by: 'recap', model: '', effort: 'medium' }, 'invalid values are the defaults');
    const toJudge = down(10);
    const by = typed(start(), [...toJudge, '\r', 'j', 'j', '\r']).state;
    assert.equal(by.draft.judge.by, 'claude', 'recap → auto → claude');
    assert.deepEqual([...changes(by)], [['TAB_RECAP_JUDGE_BY', 'claude']]);
    const model = typed(start(), [...toJudge, 'l', '\r', 'o', 'p', 'u', 's', '\r']).state;
    assert.deepEqual([...changes(model)], [['TAB_RECAP_JUDGE_MODEL', 'opus']]);
    const effort = typed(start(), [...toJudge, 'l', 'l', '\r', 'j', '\r']).state;
    assert.deepEqual([...changes(effort)], [['TAB_RECAP_JUDGE_EFFORT', 'high']]);
    assert.deepEqual(locksOf({ TAB_RECAP_JUDGE_BY: 'off', TAB_RECAP_JUDGE_MODEL: 'x', TAB_RECAP_JUDGE_EFFORT: 'low' }), { judgeBy: 'TAB_RECAP_JUDGE_BY', judgeModel: 'TAB_RECAP_JUDGE_MODEL', judgeEffort: 'TAB_RECAP_JUDGE_EFFORT' });
    assert.equal(typed(start({ judgeModel: 'TAB_RECAP_JUDGE_MODEL' }), [...toJudge, 'l', '\r']).state.note, 'locked');
    assert.equal(typed(start({ judgeModel: 'TAB_RECAP_JUDGE_MODEL' }), [...toJudge, 'l', 'l', '\r']).state.editing?.kind, 'choice', 'only the locked part is read-only');
});

test('the autocompact rows: mode (shadow by default), the minimum (10, 10–95) and the decider job (as the recap writer, low; jev among the choices), saved under their variables and read-only when set', () => {
    const raw = { locale: undefined, recapLanguage: undefined };
    assert.deepEqual([draft.autocompact, draft.autocompactAt, draft.decide], ['shadow', '10', { by: 'recap', model: '', effort: 'low' }]);
    assert.deepEqual(draftFrom({ backend: 'codex', models }, { ...raw, autocompact: 'ON', autocompactAt: '55%', decideBy: 'jev', decideModel: ' x ', decideEffort: 'high' }).decide, { by: 'jev', model: 'x', effort: 'high' });
    assert.deepEqual(draftFrom({ backend: 'codex', models }, { ...raw, autocompact: 'maybe', autocompactAt: '5' }).autocompactAt, '10');
    const mode = typed(start(), [...down(12),'\r', 'j', '\r']).state;
    assert.deepEqual([...changes(mode)], [['TAB_RECAP_AUTOCOMPACT', 'on']]);
    const at = typed(start(), [...down(13),'\r', '\u0015', '6', '0', '\r']).state;
    assert.deepEqual([...changes(at)], [['TAB_RECAP_AUTOCOMPACT_AT', '60']]);
    assert.equal(typed(at, ['\r', '\u0015', '9', '9', '\r']).state.draft.autocompactAt, '10', 'out of range is the default');
    const by = typed(start(), [...down(15),'\r', ...Array.from({ length: 7 }, () => 'j'), '\r']).state;
    assert.deepEqual([...changes(by)], [['TAB_RECAP_AUTOCOMPACT_BY', 'jev']]);
    const model = typed(start(), [...down(15),'l', '\r', 'm', '\r', 'l', '\r', 'j', '\r']).state;
    assert.deepEqual([...changes(model)], [['TAB_RECAP_AUTOCOMPACT_MODEL', 'm'], ['TAB_RECAP_AUTOCOMPACT_EFFORT', 'medium']]);
    assert.deepEqual(locksOf({ TAB_RECAP_AUTOCOMPACT: 'on', TAB_RECAP_AUTOCOMPACT_AT: '50', TAB_RECAP_AUTOCOMPACT_BY: 'jev' }), { autocompact: 'TAB_RECAP_AUTOCOMPACT', autocompactAt: 'TAB_RECAP_AUTOCOMPACT_AT', decideBy: 'TAB_RECAP_AUTOCOMPACT_BY' });
    assert.equal(typed(start({ autocompact: 'TAB_RECAP_AUTOCOMPACT' }), [...down(12),'\r']).state.note, 'locked');
});

test('the key and the endpoint of the TypeSafe API are never a row or a config entry the modal writes', () => {
    const everything = typed(start(), ['\r', ...down(2), '\r']).state;
    const keys = [...changes({ ...everything, draft: { ...everything.draft, autocompact: 'on', decide: { by: 'jev', model: 'm', effort: 'high' } } }).keys()];
    assert.ok(keys.every((key) => !/JEV|TYPESAFE/u.test(key)), keys.join(','));
});
