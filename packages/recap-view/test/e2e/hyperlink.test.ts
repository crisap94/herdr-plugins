import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLOSE_LINK, hyperlink, isSafeUrl, LINK_SEQUENCE, linkAfter, openLink } from '@stateforge-labs/recap-view/unstable/hyperlink.ts';

const url = 'https://example.com/a';

test('hyperlink wraps text in an OSC 8 link to a safe url', () => {
    assert.equal(hyperlink('x', url), `${openLink(url)}x${CLOSE_LINK}`);
    assert.ok(new RegExp(LINK_SEQUENCE, 'u').test(openLink(url)));
});

test('hyperlink leaves the text bare when the url is unsafe', () => {
    assert.equal(hyperlink('x', 'bad url'), 'x');
    assert.equal(isSafeUrl(''), false);
    assert.equal(isSafeUrl(url), true);
});

test('linkAfter reads the url of an open sequence and null for an empty one', () => {
    assert.equal(linkAfter(openLink(url)), openLink(url));
    assert.equal(linkAfter(openLink('')), null);
    assert.equal(linkAfter('plain'), undefined);
});
