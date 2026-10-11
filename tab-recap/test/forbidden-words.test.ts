import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORBIDDEN, FORBIDDEN_PHRASE_PATTERN, FORBIDDEN_WORD_PATTERN, FORBIDDEN_PHRASES, FORBIDDEN_WORDS } from '#src/recap/domain/forbidden-words.ts';

test('the list names the plugin words in their plural and singular forms', () => {
    assert.deepEqual(FORBIDDEN_WORDS, ['recaps?', 'plugins?', 'herdr', 'tabs?']);
    assert.deepEqual(FORBIDDEN_PHRASES, ['tab-recap', 'recap column']);
});

test('every pattern is derived from the list', () => {
    assert.ok(FORBIDDEN.test('a Recap'));
    assert.ok(!FORBIDDEN.test('a summary'));
    assert.deepEqual([...'the tab-recap and a recap column'.matchAll(FORBIDDEN_PHRASE_PATTERN)].map((hit) => hit[0]), ['tab-recap', 'recap column']);
    assert.deepEqual([...'two plugins, one herdr'.matchAll(FORBIDDEN_WORD_PATTERN)].map((hit) => hit[0]), ['plugins', 'herdr']);
});
