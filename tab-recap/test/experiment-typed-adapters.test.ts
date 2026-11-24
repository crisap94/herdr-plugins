import { countOf } from '@stateforge-labs/session-ledger';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendJsonl, doneKeys, jsonLines } from '#src/adapters/experiment/io.ts';
import { Labeller } from '#src/adapters/experiment/labeller.ts';
import type { HarnessRuntime } from '#src/adapters/harness/library.ts';
import type { HarnessPort } from '#src/ports/harness.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { parseUsd } from '@stateforge-labs/session-ledger';

const txt = (value: string): Text => must(parseText(value));
const fsp = (value: string): FsPath => must(parseFsPath(value));

test('io: a missing file reads as empty; appended records round-trip and doneKeys reads the key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exp1-io-'));
    try {
        const file = fsp(join(dir, 'rows.jsonl'));
        assert.deepEqual(jsonLines(txt(file)), []);
        assert.deepEqual([...doneKeys(txt(file), txt('id'))], []);
        appendJsonl(file, { id: 'a', n: 1 });
        appendJsonl(file, { id: 'b' });
        assert.deepEqual(jsonLines(txt(file)), ['{"id":"a","n":1}', '{"id":"b"}']);
        assert.deepEqual([...doneKeys(txt(file), txt('id'))], ['a', 'b']);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('labeller: a usable first reply is returned with one attempt and no log line', async () => {
    const lines: Text[] = [];
    const harness: HarnessPort = { id: txt('fake'), label: () => txt('fake'), limit: null, run: async () => ({ kind: 'ran', text: txt('yes'), costUsd: must(parseUsd(0)) }) };
    const labeller = new Labeller({} as HarnessRuntime, countOf(2), (line) => lines.push(line), undefined, () => harness);
    const made = await labeller.ask(txt('instructions'), {}, (reply) => (reply === 'yes' ? 1 : null), txt('abc'));
    assert.equal(made.answer, 1);
    assert.equal(made.attempts, 1);
    assert.equal(made.why, null);
    assert.ok(made.ms >= 0);
    assert.deepEqual(lines, []);
});
