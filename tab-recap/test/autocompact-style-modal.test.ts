import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { changes, draftFrom, initial, locksOf, step, withAvailable } from '#src/recap/application/setup-keys.ts';
import type { Draft, Locks, Setup } from '#src/recap/application/setup-keys.ts';
import { setupView } from '#src/recap/render/setup.ts';
import type { AutocompactStyle } from '#src/recap/domain/autocompact-style.ts';

const models = { claude: '', codex: 'gpt-6-luna', opencode: '', hermes: '', custom: '' };
const draft: Draft = draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined });
const start = (locks: Locks = {}): Setup => withAvailable(initial(draft, locks), ['claude', 'codex']);
const down = (n: number): string[] => Array.from({ length: n }, () => 'j');

const readStyle = (autocompactStyle: string | undefined): AutocompactStyle => draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined, autocompactStyle }).autocompactStyle;

function typed(state: Setup, keys: readonly string[]): Setup {
    return keys.reduce((now, key) => step(now, key).state, state);
}

test('the row starts at balanced, and choosing eager writes TAB_RECAP_AUTOCOMPACT_STYLE only', () => {
    assert.equal(draft.autocompactStyle, 'balanced');
    const chosen = typed(start(), [...down(14), '\r', 'j', '\r']);
    assert.equal(chosen.draft.autocompactStyle, 'eager');
    assert.deepEqual([...changes(chosen)], [['TAB_RECAP_AUTOCOMPACT_STYLE', 'eager']]);
});

test('a locked row is never written: the row names its variable and a change is not saved', () => {
    const locked = start({ autocompactStyle: 'TAB_RECAP_AUTOCOMPACT_STYLE' });
    const attempted = typed(locked, [...down(14), '\r', 'j', '\r']);
    assert.equal(typed(locked, [...down(14), '\r']).note, 'locked');
    assert.deepEqual([...changes(attempted)], [], 'a locked row produces no change');
    assert.deepEqual(locksOf({ TAB_RECAP_AUTOCOMPACT_STYLE: 'gentle' }), { autocompactStyle: 'TAB_RECAP_AUTOCOMPACT_STYLE' });
});

test('the file\'s value: gentle and eager are read as they are; anything else is balanced', () => {
    assert.deepEqual(['gentle', 'EAGER', 'aggressive', undefined].map(readStyle), ['gentle', 'eager', 'balanced', 'balanced']);
});

test('the row shows its value and its three choices in English and Spanish, with its hint while focused', () => {
    const focused = typed(withAvailable(initial(draft, {}), ['claude']), down(14));
    const text = setupView(focused, en, 140).join('\n');
    assert.match(text, /Autocompact style\s+balanced — today's numbers/);
    assert.match(text, /how eagerly it acts/);
    const choosing = setupView(typed(focused, ['\r']), en, 140).join('\n');
    assert.match(choosing, /eager — acts sooner; asks an idle lane again every 30 min/);
    const spanish = setupView(typed(focused, ['\r']), es, 140).join('\n');
    assert.match(spanish, /eager — actúa antes; vuelve a mirar un agente libre cada 30 min/);
    assert.match(setupView(typed(withAvailable(initial(draft, {}), ['claude']), down(14)), es, 140).join('\n'), /Estilo autocomp\.\s+balanced — los números de siempre/);
});
