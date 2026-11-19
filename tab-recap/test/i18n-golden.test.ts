import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messagesFor, type Locale } from '#src/i18n/index.ts';
import { GOLDEN, GOLDEN_LOCALES } from './i18n-golden-data.ts';

interface Call { readonly args: readonly unknown[]; readonly text: unknown }

const at = (locale: Locale, path: string): unknown =>
    path.split('/').slice(1).reduce<unknown>((value, key) => (value as Readonly<Record<string, unknown>>)[key], messagesFor(locale));

test('every catalog string and every message function output stays byte-identical to the B4-2 base, in both locales', () => {
    const paths = Object.keys(GOLDEN);
    assert.ok(paths.length > 400, `${paths.length} golden entries`);
    for (const path of paths) {
        const expected = GOLDEN[path];
        const locale = GOLDEN_LOCALES.find((each) => path.startsWith(`${each}/`));
        assert.ok(locale !== undefined, path);
        const actual = at(locale, path);
        if (typeof actual === 'function') {
            for (const call of (expected as { readonly calls: readonly Call[] }).calls) {
                assert.equal((actual as (...args: readonly unknown[]) => unknown)(...call.args), call.text, `${path}(${JSON.stringify(call.args)})`);
            }
        } else {
            assert.deepEqual(actual, expected, path);
        }
    }
});
