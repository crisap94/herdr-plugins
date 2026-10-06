import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { elapsed } from '#src/recap/render/wrap.ts';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const AGES = [12 * SECOND, 5 * MINUTE, 3 * HOUR, 2 * DAY, 0];

const said = (messages: typeof en, ms: number): string => messages.ago(elapsed(ms).amount, elapsed(ms).unit);

test('elapsed time in English: 12s ago · 5m ago · 3h ago · 2d ago · 0s ago', () => {
    assert.deepEqual(AGES.map((ms) => said(en, ms)), ['12s ago', '5m ago', '3h ago', '2d ago', '0s ago']);
});

test('elapsed time in Spanish: hace 12 s · hace 5 min · hace 3 h · hace 2 d · hace 0 s', () => {
    assert.deepEqual(AGES.map((ms) => said(es, ms)), ['hace 12 s', 'hace 5 min', 'hace 3 h', 'hace 2 d', 'hace 0 s']);
});

test('a time in the future (clock skew) reads as zero seconds ago', () => {
    assert.equal(said(en, -5 * MINUTE), '0s ago');
    assert.equal(said(es, -5 * MINUTE), 'hace 0 s');
});

test('amounts round down to a whole number of the unit', () => {
    assert.equal(said(en, 119 * SECOND), '1m ago');
    assert.equal(said(en, 47 * HOUR), '1d ago');
});
