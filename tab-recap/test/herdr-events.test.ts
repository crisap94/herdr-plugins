import { test } from 'node:test';
import { environmentName } from '@stateforge-labs/session-ledger';
import assert from 'node:assert/strict';
import { textOf } from '@stateforge-labs/session-ledger';
import { changes, draftFrom, initial, locksOf } from '#src/recap/application/setup-keys.ts';
import type { Draft } from '#src/recap/application/setup-keys.ts';
import { readerOf } from '#test/fakes/environment.ts';

const models = { claude: textOf(''), codex: textOf(''), opencode: textOf(''), custom: textOf('') };
const draft: Draft = draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined });

test('the modal writes TAB_RECAP_HERDR_EVENTS when the row changes, and a locked row is never written', () => {
    const state = initial({ ...draft, herdrEvents: 'on' }, {});
    assert.deepEqual([...changes({ ...state, stored: draft })], [['TAB_RECAP_HERDR_EVENTS', 'on']]);
    assert.deepEqual(locksOf(readerOf({ TAB_RECAP_HERDR_EVENTS: 'on' })), { herdrEvents: 'TAB_RECAP_HERDR_EVENTS' });
    assert.equal(changes({ ...state, stored: draft, locks: { herdrEvents: environmentName(textOf('TAB_RECAP_HERDR_EVENTS')) } }).size, 0);
});
