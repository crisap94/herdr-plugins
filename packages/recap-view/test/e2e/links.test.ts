import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hyperlink } from '@stateforge-labs/recap-view/unstable/hyperlink.ts';
import { linked } from '@stateforge-labs/recap-view/unstable/linked.ts';
import { contextOf, linkify } from '@stateforge-labs/recap-view/unstable/links.ts';
import type { Web } from '@stateforge-labs/recap-view';

const github: Web = { base: 'https://github.com/acme/app', forge: 'github', branch: 'main' };

test('contextOf keeps the shared web and drops a branch the contexts disagree on', () => {
    assert.deepEqual(contextOf([null, github, { ...github, branch: 'dev' }]), { ...github, branch: null });
    assert.equal(contextOf([github, { ...github, base: 'https://github.com/acme/other' }]), null);
    assert.equal(contextOf([null]), null);
});

test('linkify links issue numbers to the forge pull page', () => {
    const pieces = linkify('see #12', [github]).filter((piece) => piece.text !== '');
    assert.deepEqual(pieces, [
        { text: 'see ' },
        { text: '#12', url: 'https://github.com/acme/app/pull/12' },
    ]);
});

test('linked wraps each linked piece in a hyperlink', () => {
    assert.equal(linked('see #12', [github]), `see ${hyperlink('#12', 'https://github.com/acme/app/pull/12')}`);
});
