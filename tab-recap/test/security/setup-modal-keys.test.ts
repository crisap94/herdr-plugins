import { test } from 'node:test';
import { uncheckedAgentKind } from '#src/recap/domain/ids.ts';
import assert from 'node:assert/strict';
import { changes, draftFrom, initial, step, withAvailable } from '#src/recap/application/setup-keys.ts';
import type { Draft, Effect, Locks, Setup } from '#src/recap/application/setup-keys.ts';
import { textOf } from '@stateforge-labs/session-ledger';

const models = { claude: textOf(''), codex: textOf('gpt-6-luna'), opencode: textOf(''), custom: textOf('') };
const draft: Draft = draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined });

function typed(state: Setup, keys: readonly string[]): { state: Setup; effects: Effect[] } {
    const effects: Effect[] = [];
    let now = state;
    for (const key of keys) {
        const stepped = step(now, textOf(key));
        now = stepped.state;
        effects.push(...stepped.effects);
    }
    return { state: now, effects };
}

const start = (locks: Locks = {}): Setup => withAvailable(initial(draft, locks), [uncheckedAgentKind('claude'), uncheckedAgentKind('codex')]);
const down = (n: number): string[] => Array.from({ length: n }, () => 'j');

test('the key and the endpoint of the TypeSafe API are never a row or a config entry the modal writes', () => {
    const everything = typed(start(), ['\r', ...down(2), '\r']).state;
    const keys = [...changes({ ...everything, draft: { ...everything.draft, autocompact: 'on', decide: { by: 'jev', model: textOf('m'), effort: 'high' } } }).keys()];
    assert.ok(keys.every((key) => !/JEV|TYPESAFE/u.test(key)), keys.join(','));
});
