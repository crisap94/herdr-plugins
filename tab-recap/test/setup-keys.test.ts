import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changes, dirty, draftFrom, initial, locksOf, modelTarget, saved, step, tested, withAvailable } from '#src/recap/application/setup-keys.ts';
import type { Draft, Effect, Locks, Setup } from '#src/recap/application/setup-keys.ts';

const ESC = String.fromCodePoint(0x1b);
const models = { claude: '', codex: 'gpt-6-luna', opencode: '', hermes: '', custom: '' };
const draft: Draft = draftFrom({ backend: 'codex', models, words: 450 }, { locale: undefined, recapLanguage: undefined });

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

test('navigation: j/k and arrows move between the five rows and stop at the ends', () => {
    assert.equal(typed(start(), ['k', 'k']).state.row, 0);
    assert.equal(typed(start(), ['j', `${ESC}[B`]).state.row, 2);
    assert.equal(typed(start(), down(20)).state.row, 4);
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

test('words: only whole numbers from 50 to 2000 are accepted; a bad one keeps the editor open with a note', () => {
    const open = typed(start(), ['j', 'j', '\r', '\u0015']).state;
    const bad = typed(open, ['9', '\r']).state;
    assert.equal(bad.note, 'invalid');
    assert.notEqual(bad.editing, null);
    const good = typed(bad, ['\u0015', '6', '0', '0', '\r']).state;
    assert.equal(good.draft.words, 600);
    assert.deepEqual([...changes(good)], [['TAB_RECAP_WORDS', '600']]);
    assert.equal(typed(open, ['2', '5', '0', '0', '\r']).state.note, 'invalid');
});

test('interface language: auto · en · es; recap language: ui · en · es · free text, sanitised', () => {
    const es = typed(start(), [...down(3), '\r', 'j', 'j', '\r']).state;
    assert.equal(es.draft.locale, 'es');
    const free = typed(start(), [...down(4), '\r', '\u0015', 'P', 'o', 'r', 't', 'u', 'g', 'u', 'ê', 's', '!', '\r']).state;
    assert.equal(free.draft.recapLanguage, 'Português');
    const mapped = typed(start(), [...down(4), '\r', '\u0015', 'S', 'p', 'a', 'n', 'i', 's', 'h', '\r']).state;
    assert.equal(mapped.draft.recapLanguage, 'es');
    const empty = typed(start(), [...down(4), '\r', '\u0015', '\r']).state;
    assert.equal(empty.draft.recapLanguage, 'ui');
});

test('a row an environment variable overrides is read-only and says which variable', () => {
    const locks = locksOf({ TAB_RECAP_WORDS: '300', TAB_RECAP_MODEL_CODEX: 'x', TAB_RECAP_LOCALE: '' });
    assert.deepEqual(locks, { words: 'TAB_RECAP_WORDS', model: 'TAB_RECAP_MODEL_CODEX' });
    const locked = typed(start(locks), ['j', 'j', '\r']).state;
    assert.equal(locked.editing, null);
    assert.equal(locked.note, 'locked');
    const forced = { ...start(locks), draft: { ...draft, words: 999 } };
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
    const changed = typed(start(), [...down(4), '\r', '\u0015', 'e', 's', '\r']).state;
    const { effects } = typed(changed, ['s']);
    assert.deepEqual(effects, [{ kind: 'save', values: new Map([['TAB_RECAP_RECAP_LANG', 'es']]), languageChanged: true }]);
    const after = saved(changed, null, true);
    assert.equal(dirty(after), false);
    assert.equal(after.note, 'rewriting');
    assert.equal(saved(changed, 'disk full', false).note !== 'saved', true);
    const words = typed(start(), ['j', 'j', '\r', '\u0015', '5', '0', '0', '\r', 's']).effects;
    assert.deepEqual(words, [{ kind: 'save', values: new Map([['TAB_RECAP_WORDS', '500']]), languageChanged: false }]);
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
