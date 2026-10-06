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

test('navigation: j/k and arrows move between the ten rows and stop at the ends', () => {
    assert.equal(typed(start(), ['k', 'k']).state.row, 0);
    assert.equal(typed(start(), ['j', `${ESC}[B`]).state.row, 2);
    assert.equal(typed(start(), down(20)).state.row, 9);
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
    const edited = typed(start(), ['j', '\r', '\u0015', 'g', 'p', 't', '-', '6', '\r']).state;
    assert.equal(edited.draft.models.codex, 'gpt-6');
    assert.deepEqual([...changes(edited)], [['TAB_RECAP_MODEL_CODEX', 'gpt-6']]);
    const auto = withAvailable(initial({ ...draft, backend: 'auto' }, {}), ['hermes', 'codex']);
    assert.equal(modelTarget(auto.draft, auto.available), 'codex');
    const none = withAvailable(initial({ ...draft, backend: 'auto' }, {}), []);
    assert.equal(typed(none, ['j', '\r']).state.note, 'no-agent');
    assert.equal(modelTarget({ ...draft, backend: 'custom' }, ['claude']), null);
});

test('text rows: backspace and ctrl-u; typing ‘q’, ‘s’ or ‘t’ is text while editing, not a command', () => {
    const state = typed(start(), ['j', '\r', '\u007f', 'q', 's', 't']).state;
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
    const locked = typed(start(locks), ['j', '\r']).state;
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

test('the effort row: low by default, a choice list, saved as TAB_RECAP_EFFORT, read-only when the variable is set', () => {
    assert.equal(draft.effort, 'low');
    assert.equal(draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined, effort: ' HIGH ' }).effort, 'high');
    assert.equal(draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined, effort: 'max' }).effort, 'low');
    const medium = typed(start(), [...down(6), '\r', 'j', '\r']);
    assert.equal(medium.state.draft.effort, 'medium');
    assert.deepEqual([...changes(medium.state)], [['TAB_RECAP_EFFORT', 'medium']]);
    assert.deepEqual(locksOf({ TAB_RECAP_EFFORT: 'high' }), { effort: 'TAB_RECAP_EFFORT' });
    assert.equal(typed(start({ effort: 'TAB_RECAP_EFFORT' }), [...down(6), '\r']).state.note, 'locked');
});

test('the compaction rows: target, hint (40 by default, 10–95 or off) and window (empty = found at runtime), each saved under its variable and read-only when it is set', () => {
    assert.deepEqual([draft.compactTarget, draft.compactHint, draft.contextWindow], ['focused', '40', '']);
    const raw = { locale: undefined, recapLanguage: undefined };
    assert.deepEqual(draftFrom({ backend: 'codex', models }, { ...raw, compactTarget: ' Claude, codex ', compactHint: '60%', contextWindow: '1_000_000' }).compactTarget, 'claude,codex');
    assert.equal(draftFrom({ backend: 'codex', models }, { ...raw, compactHint: '5' }).compactHint, '40', 'out of range is the default');
    assert.equal(draftFrom({ backend: 'codex', models }, { ...raw, compactHint: 'OFF' }).compactHint, 'off');
    assert.equal(draftFrom({ backend: 'codex', models }, { ...raw, contextWindow: '1_000_000' }).contextWindow, '1000000');
    const target = typed(start(), [...down(7), '\r', '\u0015', 'a', 'l', 'l', '\r']).state;
    assert.deepEqual([...changes(target)], [['TAB_RECAP_COMPACT_TARGET', 'all']]);
    const hint = typed(start(), [...down(8), '\r', '\u0015', '5', '5', '\r']).state;
    assert.deepEqual([...changes(hint)], [['TAB_RECAP_COMPACT_HINT', '55']]);
    assert.equal(typed(hint, ['\r', '\u0015', '3', '\r']).state.draft.compactHint, '40', 'a value out of range falls back to the default');
    assert.equal(typed(hint, ['\r', '\u0015', 'o', 'f', 'f', '\r']).state.draft.compactHint, 'off');
    const window = typed(start(), [...down(9), '\r', '3', '0', '0', '0', '0', '0', '\r']).state;
    assert.deepEqual([...changes(window)], [['TAB_RECAP_CONTEXT_WINDOW', '300000']]);
    assert.equal(typed(window, ['\r', '\u0015', '\r']).state.draft.contextWindow, '', 'emptied: detect at runtime');
    assert.deepEqual(locksOf({ TAB_RECAP_COMPACT_TARGET: 'all', TAB_RECAP_COMPACT_HINT: 'off', TAB_RECAP_CONTEXT_WINDOW: '1' }), { compactTarget: 'TAB_RECAP_COMPACT_TARGET', compactHint: 'TAB_RECAP_COMPACT_HINT', contextWindow: 'TAB_RECAP_CONTEXT_WINDOW' });
    assert.equal(typed(start({ compactHint: 'TAB_RECAP_COMPACT_HINT' }), [...down(8), '\r']).state.note, 'locked');
});
