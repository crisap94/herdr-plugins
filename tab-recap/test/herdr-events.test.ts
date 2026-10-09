// `TAB_RECAP_HERDR_EVENTS`: off by default, a setting row in the modal, and what the modal writes for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { herdrEventsOf } from '#src/recap/domain/herdr-events.ts';
import { changes, draftFrom, initial, locksOf } from '#src/recap/application/setup-keys.ts';
import type { Draft } from '#src/recap/application/setup-keys.ts';

const models = { claude: '', codex: '', opencode: '', hermes: '', custom: '' };
const draft: Draft = draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined });

test('off unless set to on: a fresh install shares nothing on herdr', () => {
    assert.equal(herdrEventsOf(undefined), 'off');
    assert.equal(herdrEventsOf(''), 'off');
    assert.equal(herdrEventsOf('maybe'), 'off');
    assert.equal(herdrEventsOf(' ON '), 'on');
    assert.equal(draft.herdrEvents, 'off');
    assert.equal(draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined, herdrEvents: 'on' }).herdrEvents, 'on');
});

test('the modal writes TAB_RECAP_HERDR_EVENTS when the row changes, and a locked row is never written', () => {
    const state = initial({ ...draft, herdrEvents: 'on' }, {});
    assert.deepEqual([...changes({ ...state, stored: draft })], [['TAB_RECAP_HERDR_EVENTS', 'on']]);
    assert.deepEqual(locksOf({ TAB_RECAP_HERDR_EVENTS: 'on' }), { herdrEvents: 'TAB_RECAP_HERDR_EVENTS' });
    assert.equal(changes({ ...state, stored: draft, locks: { herdrEvents: 'TAB_RECAP_HERDR_EVENTS' } }).size, 0);
});
