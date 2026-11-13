import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parsePayload } from '../src/payload.ts';
import type { HostEvent, Parsed } from '../src/payload.ts';

const PAYLOADS = join(import.meta.dirname, 'fixtures', 'payloads');
const payload = (name: string): string => readFileSync(join(PAYLOADS, `${name}.json`), 'utf8');

function eventOf(parsed: Parsed): HostEvent {
    assert.equal(parsed.kind, 'event', JSON.stringify(parsed));
    if (parsed.kind !== 'event') {
        throw new Error('unreachable');
    }
    return parsed.event;
}

const base = (n: string, event: string): { session: string; records: string; cwd: string } => ({ session: `fx-${event}-${n}`, records: `/home/user/.claude/projects/p/fx-${event}-${n}.jsonl`, cwd: '/tmp/work' });

test('every captured and hand-written Claude payload parses into a host event', () => {
    const names = readdirSync(PAYLOADS).filter((name) => name.endsWith('.json'));
    assert.ok(names.length >= 12);
    for (const name of names) {
        assert.equal(parsePayload(readFileSync(join(PAYLOADS, name), 'utf8')).kind, 'event', name);
    }
});

test('SessionStart carries its source: startup, resume, clear, compact and fork', () => {
    assert.deepEqual(eventOf(parsePayload(payload('SessionStart-01-startup'))), { ...base('1', 'SessionStart'), name: 'SessionStart', source: 'startup' });
    assert.deepEqual(eventOf(parsePayload(payload('SessionStart-02-resume'))), { ...base('2', 'SessionStart'), name: 'SessionStart', source: 'resume' });
    assert.deepEqual(eventOf(parsePayload(payload('SessionStart-03-clear'))), { ...base('3', 'SessionStart'), name: 'SessionStart', source: 'clear' });
    assert.deepEqual(eventOf(parsePayload(payload('hand-SessionStart-compact'))), { ...base('compact', 'SessionStart'), name: 'SessionStart', source: 'compact' });
    assert.deepEqual(eventOf(parsePayload(payload('hand-SessionStart-fork'))), { ...base('fork', 'SessionStart'), name: 'SessionStart', source: 'fork' });
});

test('PreCompact carries its trigger and custom instructions, null when the payload has none', () => {
    assert.deepEqual(eventOf(parsePayload(payload('PreCompact-01-manual'))), { ...base('1', 'PreCompact'), name: 'PreCompact', trigger: 'manual', instructions: null });
    assert.deepEqual(eventOf(parsePayload(payload('PreCompact-02-auto'))), { ...base('2', 'PreCompact'), name: 'PreCompact', trigger: 'auto', instructions: null });
    const given = JSON.stringify({ ...JSON.parse(payload('PreCompact-01-manual')) as object, custom_instructions: 'keep the plan' });
    assert.deepEqual(eventOf(parsePayload(given)), { ...base('1', 'PreCompact'), name: 'PreCompact', trigger: 'manual', instructions: 'keep the plan' });
});

test('PostCompact carries its trigger and the compaction text', () => {
    assert.deepEqual(eventOf(parsePayload(payload('PostCompact-01-manual'))), { ...base('1', 'PostCompact'), name: 'PostCompact', trigger: 'manual', compactText: 'PLACEHOLDER-compact_summary' });
    assert.deepEqual(eventOf(parsePayload(payload('PostCompact-02-auto'))), { ...base('2', 'PostCompact'), name: 'PostCompact', trigger: 'auto', compactText: 'PLACEHOLDER-compact_summary' });
});

test('Stop carries the last assistant message, null when the payload has none', () => {
    assert.deepEqual(eventOf(parsePayload(payload('Stop-01-base'))), { ...base('1', 'Stop'), name: 'Stop', lastMessage: 'PLACEHOLDER-last_assistant_message' });
    const second = eventOf(parsePayload(payload('Stop-02-base')));
    assert.equal(second.name === 'Stop' ? second.lastMessage : 'not a stop', null);
});

test('malformed input, unknown events and missing or wrong fields are refused with a reason, never thrown', () => {
    const stop = JSON.parse(payload('Stop-01-base')) as Record<string, unknown>;
    const cases: readonly (readonly [string, string])[] = [
        ['', 'malformed'],
        ['{"session_id":', 'malformed'],
        ['[1,2]', 'not-an-object'],
        ['null', 'not-an-object'],
        ['"Stop"', 'not-an-object'],
        [JSON.stringify({ ...stop, hook_event_name: 'UserPromptSubmit' }), 'unknown-event'],
        [JSON.stringify({ ...stop, hook_event_name: undefined }), 'unknown-event'],
        [JSON.stringify({ ...stop, session_id: undefined }), 'missing-field'],
        [JSON.stringify({ ...stop, transcript_path: null }), 'missing-field'],
        [JSON.stringify({ ...stop, cwd: 7 }), 'bad-value'],
        [JSON.stringify({ ...stop, session_id: '  ' }), 'bad-value'],
        [JSON.stringify({ ...stop, last_assistant_message: 42 }), 'bad-value'],
        [JSON.stringify({ ...JSON.parse(payload('SessionStart-01-startup')) as object, source: 'teleport' }), 'bad-value'],
        [JSON.stringify({ ...JSON.parse(payload('SessionStart-01-startup')) as object, source: undefined }), 'missing-field'],
        [JSON.stringify({ ...JSON.parse(payload('PreCompact-01-manual')) as object, trigger: 'sometimes' }), 'bad-value'],
        [JSON.stringify({ ...JSON.parse(payload('PostCompact-01-manual')) as object, 'compact_summary': {} }), 'bad-value'],
    ];
    for (const [text, why] of cases) {
        const parsed = parsePayload(text);
        assert.equal(parsed.kind, 'refused', text);
        assert.equal(parsed.kind === 'refused' ? parsed.why : null, why, text);
    }
});
