import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHandoffId } from '#src/recap/domain/ids.ts';

test('a handoff id is a TypeID hnd_ with 26 base32 characters, and anything else is refused at the edge', () => {
    const id = 'hnd_01j3tt8z1efcd9tfr14d2pf2db';
    assert.equal(parseHandoffId(id), id);
    for (const bad of ['', 'not-an-id', 'hnd_', 'req_01j3tt8z1efcd9tfr14d2pf2db', 'HND_01J3TT8Z1EFCD9TFR14D2PF2DB', 'hnd_81j3tt8z1efcd9tfr14d2pf2db', 'hnd_01j3tt8z1efcd9tfr14d2pf2d', 'hnd_01j3tt8z1efcd9tfr14d2pf2dil']) {
        assert.equal(parseHandoffId(bad), null, bad);
    }
});

test('parseHandoffId yields the id for a handoff TypeID and null for any other value', () => {
    const id = 'hnd_01j3tt8z1efcd9tfr14d2pf2db';
    assert.equal(parseHandoffId(id), id);
    for (const bad of [null, undefined, 7, { id }, 'hnd_01j3tt8z1efcd9tfr14d2pf2d', 'hnd_81j3tt8z1efcd9tfr14d2pf2db']) {
        assert.equal(parseHandoffId(bad), null);
    }
});
