import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MESSAGES } from 'herdr-desktop-mods/tab-recap/catalog';
import { isLanguage, resolveLanguage } from 'herdr-desktop-mods/tab-recap/language';

const shapeOf = (value: unknown): unknown => {
    if (typeof value === 'function') {
        return `fn${value.length}`;
    }
    if (Array.isArray(value)) {
        return value.map(shapeOf);
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).toSorted(([a], [b]) => a.localeCompare(b)).map(([key, each]) => [key, shapeOf(each)]));
    }
    return typeof value;
};

const strings = (value: unknown): string[] => {
    if (typeof value === 'string') {
        return [value];
    }
    if (value !== null && typeof value === 'object') {
        return Object.values(value).flatMap(strings);
    }
    return [];
};

test('the table has exactly en and es', () => {
    assert.deepEqual(Object.keys(MESSAGES).toSorted((a, b) => a.localeCompare(b)), ['en', 'es']);
});

test('en and es carry identical keys at every depth, with the same kind and arity of value', () => {
    assert.deepEqual(shapeOf(MESSAGES['es']), shapeOf(MESSAGES['en']));
});

test('no message is empty, and the Spanish is not a copy of the English wholesale', () => {
    const en = strings(MESSAGES['en']);
    const es = strings(MESSAGES['es']);
    assert.ok(en.every((text) => text.length > 0));
    assert.ok(es.every((text) => text.length > 0));
    const same = es.filter((text, at) => text === en[at] && /[a-z]{4,}/.test(text));
    assert.ok(same.length < en.length / 10, `${same.length} untranslated`);
});

const call = (lang: string): unknown => {
    const waiting = MESSAGES[lang]?.['waiting'];
    return typeof waiting === 'function' ? waiting(5) : null;
};

test('functions answer in both languages', () => {
    assert.equal(call('en'), 'waiting 5 min');
    assert.equal(call('es'), 'espera 5 min');
});

test('the tab-recap language wins; auto and anything unknown follow the system, default English', () => {
    assert.equal(resolveLanguage('es', 'en_US.UTF-8'), 'es');
    assert.equal(resolveLanguage('en', 'es_ES.UTF-8'), 'en');
    assert.equal(resolveLanguage('auto', 'es_AR.UTF-8'), 'es');
    assert.equal(resolveLanguage('auto', 'ES_MX'), 'es');
    assert.equal(resolveLanguage('auto', 'en_GB.UTF-8'), 'en');
    assert.equal(resolveLanguage('auto', 'fr_FR.UTF-8'), 'en');
    assert.equal(resolveLanguage(undefined, 'es_ES.UTF-8'), 'es');
    assert.equal(resolveLanguage('fr', 'es_ES.UTF-8'), 'es');
    assert.equal(resolveLanguage(undefined, undefined), 'en');
    assert.equal(resolveLanguage('auto', ''), 'en');
});

test('isLanguage knows the two languages', () => {
    assert.ok(isLanguage('en') && isLanguage('es'));
    assert.ok(!isLanguage('auto') && !isLanguage(null) && !isLanguage('fr'));
});
