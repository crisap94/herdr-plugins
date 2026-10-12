import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureCauseOf } from '#src/recap/domain/failure-cause.ts';

test('a failure cause is the error name alone when the error has no string code', () => {
    assert.equal(failureCauseOf(new TypeError('bad\nvalue  here')), 'TypeError');
    assert.equal(failureCauseOf(new Error('')), 'Error');
    assert.equal(failureCauseOf(Object.assign(new Error('code is a number'), { code: 5 })), 'Error');
    assert.equal(failureCauseOf('a thrown string'), 'NonError');
});

test('a failure cause never carries the message, so a path in it cannot leak', () => {
    assert.equal(failureCauseOf(new Error('/home/coder/secret/db.sqlite is missing')), 'Error');
});

test('a failure cause adds the string code of the error after its name', () => {
    assert.equal(failureCauseOf(Object.assign(new Error("ENOENT: no such file, open '/x'"), { code: 'ENOENT' })), 'Error: ENOENT');
    assert.equal(failureCauseOf(Object.assign(new Error('database is locked'), { name: 'SqliteError', code: 'SQLITE_BUSY' })), 'SqliteError: SQLITE_BUSY');
});

test('a failure cause accepts only a plain name and an upper-case code, so a hostile error cannot put text in a log', () => {
    assert.equal(failureCauseOf(Object.assign(new Error('x'), { name: '/home/coder/secret' })), 'Error');
    assert.equal(failureCauseOf(Object.assign(new Error('x'), { name: 'Name with spaces\nand a newline' })), 'Error');
    assert.equal(failureCauseOf(Object.assign(new Error('x'), { code: '/home/coder/secret' })), 'Error');
    assert.equal(failureCauseOf(Object.assign(new Error('x'), { code: 'lower case' })), 'Error');
    assert.equal(failureCauseOf(Object.assign(new Error('x'), { code: `SQLITE_${'A'.repeat(60)}` })), 'Error');
});

test('a failure cause never throws, even for an error whose properties throw', () => {
    const hostile = new Error('x');
    Object.defineProperty(hostile, 'code', { get(): string { throw new Error('getter'); } });
    assert.equal(failureCauseOf(hostile), 'Error');
    const nameThrows = new Error('x');
    Object.defineProperty(nameThrows, 'name', { get(): string { throw new Error('getter'); } });
    assert.equal(failureCauseOf(nameThrows), 'Error');
});
