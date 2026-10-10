import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpencodeTranscripts } from '#src/adapters/opencode-transcripts.ts';
import { opencodeFixture, toolPart } from '#test/opencode-fixture.ts';

test('opencode: running or pending tool parts count; completed and error parts do not', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-opencode-flight-'));
    const fixture = opencodeFixture(dir);
    try {
        fixture.add({ id: 'msg-completed', session: 'ses_new', role: 'assistant', updated: 100, parts: [toolPart('completed', { time: { start: 1, end: 2 } })] });
        fixture.add({ id: 'msg-error', session: 'ses_new', role: 'assistant', updated: 110, parts: [toolPart('error', { error: 'x' })] });
        fixture.add({ id: 'msg-running', session: 'ses_new', role: 'assistant', updated: 120, data: { finish: null }, parts: [toolPart('running', { input: { command: 'x' }, time: { start: 3 } })] });
        fixture.add({ id: 'msg-pending', session: 'ses_new', role: 'assistant', updated: 130, data: { finish: 'stop' }, parts: [toolPart('pending', { input: { command: 'x' } })] });
        const reader = fixtureReader(fixture.db);
        assert.deepEqual(await reader.inFlight.read(`${fixture.db}#ses_new`, 1), { kind: 'in-flight', count: 2 });
    } finally {
        fixture.close();
        rmSync(dir, { recursive: true, force: true });
    }
});

test('opencode: a running part with only time.start counts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-opencode-running-'));
    const fixture = opencodeFixture(dir);
    try {
        fixture.add({ id: 'msg-running', session: 'ses_new', role: 'assistant', updated: 100, data: { finish: null }, parts: [toolPart('running', { time: { start: 3 } })] });
        const reader = fixtureReader(fixture.db);
        assert.deepEqual(await reader.inFlight.read(`${fixture.db}#ses_new`, 1), { kind: 'in-flight', count: 1 });
    } finally {
        fixture.close();
        rmSync(dir, { recursive: true, force: true });
    }
});

test('opencode: a running part from another session is not counted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-opencode-sessions-'));
    const fixture = opencodeFixture(dir);
    try {
        fixture.add({ id: 'msg-current', session: 'ses_new', role: 'assistant', updated: 100, parts: [toolPart('pending')] });
        fixture.add({ id: 'msg-other', session: 'ses_other', role: 'assistant', updated: 110, parts: [toolPart('running')] });
        fixture.add({ id: 'msg-other-2', session: 'ses_other', role: 'assistant', updated: 120, parts: [toolPart('running')] });
        const reader = fixtureReader(fixture.db);
        assert.deepEqual(await reader.inFlight.read(`${fixture.db}#ses_new`, 10), { kind: 'in-flight', count: 1 });
    } finally {
        fixture.close();
        rmSync(dir, { recursive: true, force: true });
    }
});

test('opencode: a running part in a message older than the newest-message limit is not counted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-opencode-newest-'));
    const fixture = opencodeFixture(dir);
    try {
        fixture.add({ id: 'msg-old', session: 'ses_new', role: 'assistant', updated: 100, parts: [toolPart('running')] });
        for (let index = 0; index < 400; index += 1) {
            fixture.add({ id: `msg-new-${index}`, session: 'ses_new', role: 'assistant', updated: 200 + index, parts: [] });
        }
        const reader = fixtureReader(fixture.db);
        assert.deepEqual(await reader.inFlight.read(`${fixture.db}#ses_new`, 1), { kind: 'in-flight', count: 0 });
    } finally {
        fixture.close();
        rmSync(dir, { recursive: true, force: true });
    }
});

test('opencode: a running-looking non-tool part is not counted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-opencode-part-type-'));
    const fixture = opencodeFixture(dir);
    try {
        fixture.add({ id: 'msg-current', session: 'ses_new', role: 'assistant', updated: 100, parts: [{ type: 'text', state: { status: 'running' } }] });
        const reader = fixtureReader(fixture.db);
        assert.deepEqual(await reader.inFlight.read(`${fixture.db}#ses_new`, 10), { kind: 'in-flight', count: 0 });
    } finally {
        fixture.close();
        rmSync(dir, { recursive: true, force: true });
    }
});

test('opencode: a database that cannot be opened is unknown', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-opencode-missing-'));
    try {
        const reader = new OpencodeTranscripts(join(dir, 'missing.db'));
        const found = await reader.inFlight.read(`${dir}/missing.db#ses-1`, 1);
        assert.equal(found.kind, 'unknown');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

function fixtureReader(database: string): OpencodeTranscripts {
    return new OpencodeTranscripts(database);
}
