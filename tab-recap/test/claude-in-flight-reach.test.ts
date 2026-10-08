// The Claude in-flight reader past the tail: a notice whose launch lies before the 512 KB tail is read back for, up to 16 MB; the bound answers unknown.
// The transcripts are generated in a temp directory, never committed.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeTranscripts, KEPT_UNKNOWN_MAX } from '#src/adapters/claude-transcripts.ts';

const TAIL = 512 * 1024;
const MB = 1024 * 1024;
const line = (row: object): string => JSON.stringify(row);
const launch = (id: string): string => line({ type: 'assistant', isSidechain: false, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'sleep 99', run_in_background: true } }] } });
const started = (id: string, task: string): string => line({ type: 'user', toolUseResult: { stdout: '', backgroundTaskId: task }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: `Command running in background with ID: ${task}.` }] } });
const notice = (task: string, tool: string): string => line({ type: 'user', origin: { kind: 'task-notification' }, message: { role: 'user', content: `<task-notification>\n<task-id>${task}</task-id>\n<tool-use-id>${tool}</tool-use-id>\n<status>completed</status>\n</task-notification>` } });
const chat = (text: string): string => line({ type: 'assistant', isSidechain: false, message: { role: 'assistant', content: [{ type: 'text', text }] } });

/** Chat lines of about 1 KB each, until `bytes` are written. */
function filler(bytes: number): string[] {
    const out: string[] = [];
    for (let written = 0; written < bytes; ) {
        const next = chat('x'.repeat(1000));
        out.push(next);
        written += Buffer.byteLength(next) + 1;
    }
    return out;
}

/** `head` bytes of chat, the opening lines, `middle` bytes of chat, the two notices, `tail` bytes of chat: the notices sit in the last 512 KB. */
function transcript(head: number, opening: string[], middle: number, tail: number): string[] {
    return [...filler(head), ...opening, ...filler(middle), notice('b1', 't1'), notice('b2', 't2'), ...filler(tail)];
}

const dir = mkdtempSync(join(tmpdir(), 'recap-inflight-reach-'));
const write = (name: string, lines: readonly string[]): string => {
    const path = join(dir, name);
    writeFileSync(path, `${lines.join('\n')}\n`);
    return path;
};
const pair = [launch('t1'), started('t1', 'b1'), launch('t2'), started('t2', 'b2')];

test('past the tail: completed work launched 1 MB before the end (a 3 MB transcript) is ended, so zero in flight', async () => {
    const path = write('completed.jsonl', transcript(2 * MB, pair, 0.9 * MB, 0.25 * MB));
    assert.ok(statSync(path).size > 3 * MB, 'a 3 MB transcript');
    assert.deepEqual(await new ClaudeTranscripts(dir).inFlight(path, TAIL), { kind: 'in-flight', count: 0 });
});

test('past the tail: a background shell launched 1 MB before the end, with no end, is still one in flight', async () => {
    const shell = [launch('t9'), started('t9', 'b9')];
    const path = write('open.jsonl', transcript(2 * MB, [...pair, ...shell], 0.9 * MB, 0.25 * MB));
    assert.deepEqual(await new ClaudeTranscripts(dir).inFlight(path, TAIL), { kind: 'in-flight', count: 1 });
});

test('a file under the budget is read once: its notices end nothing it does not hold, so it is counted', async () => {
    const path = write('small.jsonl', [chat('hello'), notice('b0', 'gone')]);
    assert.deepEqual(await new ClaudeTranscripts(dir).inFlight(path, TAIL), { kind: 'in-flight', count: 0 });
});

test('over 16 MB: the launch lies before the bound, so the answer stays unknown', async () => {
    const path = write('huge.jsonl', transcript(0, pair, 17 * MB, 0.1 * MB));
    const answer = await new ClaudeTranscripts(dir).inFlight(path, TAIL);
    assert.deepEqual(answer, { kind: 'unknown', why: { why: 'unreadable', detail: 'the tail ends work that started before it' } });
});

after(() => { rmSync(dir, { recursive: true, force: true }); });

test('an unknown answer is kept with the file size: the same size is not read again (the same tail, changed, still gives the first answer); a new size is read', async () => {
    const path = write('kept.jsonl', transcript(0, pair, 17 * MB, 0.1 * MB));
    const reader = new ClaudeTranscripts(dir);
    const first = await reader.inFlight(path, TAIL);
    assert.equal(first.kind, 'unknown');
    const size = statSync(path).size;
    writeFileSync(path, `${'x'.repeat(size - 1)}\n`);
    assert.deepEqual(await reader.inFlight(path, TAIL), first, 'same size: answered from the kept answer, not read again');
    writeFileSync(path, `${notice('b1', 't1')}\n`);
    assert.deepEqual(await reader.inFlight(path, TAIL), { kind: 'in-flight', count: 0 }, 'a new size is read');
});

test('the kept unknown answers are capped at KEPT_UNKNOWN_MAX: the oldest is forgotten (read again), the newest is still kept', async () => {
    const reader = new ClaudeTranscripts(dir);
    const oldest = write('cap-0.jsonl', ['not json!']);
    assert.equal((await reader.inFlight(oldest, TAIL)).kind, 'unknown');
    let newest = oldest;
    for (let at = 1; at <= KEPT_UNKNOWN_MAX; at += 1) {
        newest = write(`cap-${at}.jsonl`, ['not json!']);
        assert.equal((await reader.inFlight(newest, TAIL)).kind, 'unknown');
    }
    writeFileSync(oldest, '{"a":"b"}\n');
    assert.deepEqual(await reader.inFlight(oldest, TAIL), { kind: 'in-flight', count: 0 }, 'forgotten: the same size is read again');
    writeFileSync(newest, '{"a":"b"}\n');
    assert.equal((await reader.inFlight(newest, TAIL)).kind, 'unknown', 'kept: the same size is not read again');
});
