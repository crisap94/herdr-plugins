import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORBIDDEN_PHRASES, FORBIDDEN_WORDS } from '#src/recap/domain/forbidden-words.ts';
import { sanitizeHandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import { isForbidden as isVetted } from '#src/recap/domain/handoff-vetting.ts';

const SAMPLES = ['recap', 'recaps', 'plugin', 'plugins', 'herdr', 'tab', 'tabs', 'tab-recap', 'recap column'];

const isForbidden = (raw: string): boolean => isVetted(sanitizeHandoffText(raw));

test('every template of the shared list is forbidden in its own words', () => {
    for (const template of [...FORBIDDEN_WORDS, ...FORBIDDEN_PHRASES]) {
        const covered = SAMPLES.filter((sample) => new RegExp(`^(${template})$`, 'iu').test(sample));
        assert.ok(covered.length > 0, `no sample for ${template}`);
    }
});

test('each forbidden word is refused in any case and inside a sentence', () => {
    for (const sample of SAMPLES) {
        assert.ok(isForbidden(sample), sample);
        assert.ok(isForbidden(`the ${sample.toUpperCase()} is here`), sample);
    }
});

test('the word tool is not forbidden, so a tool call fact is kept', () => {
    assert.equal(isForbidden('the tool call returned an error'), false);
});

test('a word that only contains a forbidden stem is kept', () => {
    assert.equal(isForbidden('the tabular export is ready'), false);
    assert.equal(isForbidden('a summary of the herdrless state'), false);
});

test('repeated checks give the same answer', () => {
    assert.equal(isForbidden('plugin'), true);
    assert.equal(isForbidden('plugin'), true);
    assert.equal(isForbidden('tab-recap and recap column'), true);
});
