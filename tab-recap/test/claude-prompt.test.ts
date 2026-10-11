import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promptBodyOf } from '#src/adapters/claude-prompt.ts';
import { ClaudeTranscripts } from '#src/adapters/claude-transcripts.ts';
import { laneWith } from './fakes/handoff-delivery.ts';

const BODY = 'Handoff of the parser refactor.\n\nNext steps:\n  - finish the lexer\n  - run the suite';
const wrapped = (body: string, id = 'a1b2'): string => `\n\n<pasted_content id="${id}">\n${body}\n</pasted_content id="${id}">\n`;
const userRow = (content: string): string => `${JSON.stringify({ type: 'user', message: { content } })}\n`;

test('a stored multi-line paste comes back as the text that was sent', () => {
    assert.equal(promptBodyOf(wrapped(BODY)), BODY);
});

test('the id is any token and the closing tag may repeat it or not', () => {
    assert.equal(promptBodyOf(wrapped('one line', 'x9')), 'one line');
    assert.equal(promptBodyOf(`\n\n<pasted_content id="q">\none line\n</pasted_content>\n`), 'one line');
});

test('a paste whose body ends with a line feed keeps that line feed', () => {
    assert.equal(promptBodyOf(wrapped('ends here\n')), 'ends here\n');
});

test('an unwrapped single-line prompt is returned unchanged', () => {
    assert.equal(promptBodyOf('just a question?'), 'just a question?');
});

test('text that only contains the tags in the middle is not unwrapped', () => {
    const text = `Look at this:${wrapped(BODY)}and tell me.`;
    assert.equal(promptBodyOf(text), text);
});

test('text with words before a wrapper that ends the text is not unwrapped', () => {
    const text = `Look at this:${wrapped(BODY)}`;
    assert.equal(promptBodyOf(text), text);
});

test('text with trailing words after the closing tag is not unwrapped', () => {
    const text = `${wrapped(BODY)}and one more thing`;
    assert.equal(promptBodyOf(text), text);
});

test('a value that is not text is no prompt', () => {
    assert.equal(promptBodyOf(undefined), '');
    assert.equal(promptBodyOf(42), '');
});

test('the Claude reader returns the inner text of a wrapped multi-line prompt', async () => {
    const root = mkdtempSync(join(tmpdir(), 'claude-prompt-'));
    try {
        mkdirSync(join(root, 'proj'));
        writeFileSync(join(root, 'proj', 's1.jsonl'), `${userRow('an earlier question')}${userRow(wrapped(BODY))}`);
        const reader = new ClaudeTranscripts(root);
        const located = await reader.locate(laneWith({ session: 's1' }));
        assert.equal(located.kind, 'located');
        if (located.kind !== 'located') {
            return;
        }
        assert.deepEqual(await reader.latestPrompt(located.source, 65_536), { kind: 'prompt', text: BODY });
    } finally {
        rmSync(root, { recursive: true });
    }
});

test('the Claude reader returns the inner text of a wrapped last-prompt record when no user row is in the tail', async () => {
    const root = mkdtempSync(join(tmpdir(), 'claude-prompt-'));
    try {
        mkdirSync(join(root, 'proj'));
        writeFileSync(join(root, 'proj', 's1.jsonl'), `${JSON.stringify({ type: 'last-prompt', lastPrompt: wrapped(BODY) })}\n`);
        const reader = new ClaudeTranscripts(root);
        const located = await reader.locate(laneWith({ session: 's1' }));
        if (located.kind !== 'located') {
            assert.fail('the transcript must be located');
        }
        assert.deepEqual(await reader.latestPrompt(located.source, 65_536), { kind: 'prompt', text: BODY });
    } finally {
        rmSync(root, { recursive: true });
    }
});

test('the Claude reader returns the inner text of a wrapped prompt sent as the newest queued command', async () => {
    const root = mkdtempSync(join(tmpdir(), 'claude-prompt-'));
    try {
        mkdirSync(join(root, 'proj'));
        const queued = `${JSON.stringify({ type: 'attachment', attachment: { type: 'queued_command', prompt: wrapped(BODY), origin: { kind: 'human' } } })}\n`;
        writeFileSync(join(root, 'proj', 's1.jsonl'), queued);
        const reader = new ClaudeTranscripts(root);
        const located = await reader.locate(laneWith({ session: 's1' }));
        if (located.kind !== 'located') {
            assert.fail('the transcript must be located');
        }
        assert.deepEqual(await reader.latestPrompt(located.source, 65_536), { kind: 'prompt', text: BODY });
    } finally {
        rmSync(root, { recursive: true });
    }
});
