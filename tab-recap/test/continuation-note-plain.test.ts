import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continuationNote } from '#src/recap/domain/continuation-note.ts';
import { awaitedNames, backgroundItem, backgroundLabel, backgroundTool, NOT_AWAITING } from '#src/recap/domain/in-flight.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';
import { unfencedText } from '#src/adapters/job/prompts/recap-prompt.ts';

const text = (value: string): Text => must(parseText(value));

test('the note text is unchanged for control characters, tabs, newlines, runs of spaces, quotes and format characters', () => {
    assert.equal(continuationNote({ kind: 'on', names: awaitedNames('a\u0001b') }, []), 'Still waiting for: a b.');
    assert.equal(continuationNote({ kind: 'on', names: awaitedNames('p\n\nq') }, []), 'Still waiting for: p q.');
    assert.equal(continuationNote({ kind: 'on', names: awaitedNames('r   s  t') }, []), 'Still waiting for: r s t.');
    assert.equal(continuationNote({ kind: 'on', names: awaitedNames('say "hi"') }, []), "Still waiting for: say 'hi'.");
    assert.equal(continuationNote({ kind: 'on', names: awaitedNames('z​w­v﻿u') }, []), 'Still waiting for: z w v u.');
    assert.equal(continuationNote({ kind: 'on', names: awaitedNames('ok nb　ideo') }, []), 'Still waiting for: ok nb ideo.');
    assert.equal(continuationNote(NOT_AWAITING, [backgroundItem(backgroundTool('x\ty'), backgroundLabel('mix\r\n\t\u0007 "x" end'))]), 'Still running: x y "mix \'x\' end".');
    assert.equal(continuationNote(NOT_AWAITING, [backgroundItem(backgroundTool('Monitor'), backgroundLabel('  lead trail  '))]), 'Still running: Monitor "lead trail".');
    assert.equal(continuationNote(NOT_AWAITING, [backgroundItem(backgroundTool('Monitor'), backgroundLabel('\u0000\u0000'))]), 'Still running: Monitor "".');
    assert.equal(continuationNote({ kind: 'on', names: awaitedNames('r1,r2') }, [backgroundItem(backgroundTool('Monitor'), backgroundLabel('a​b\tc\nd "e"  f'))]), 'Still waiting for: r1,r2. Still running: Monitor "a b c d \'e\' f".');
});

test('unfencedText is the same function through the prompt module, with and without a fence', () => {
    assert.equal(unfencedText(text('```json\n{"a":1}\n```')), '{"a":1}');
    assert.equal(unfencedText(text('```\nx\n```')), 'x');
    assert.equal(unfencedText(text('  plain text  ')), 'plain text');
});
