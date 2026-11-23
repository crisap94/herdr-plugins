import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROTOCOL } from '@stateforge-labs/herdr-sdk';
import { resetHerdrClients } from '#src/adapters/herdr/client.ts';
import { HerdrFleetPorts } from '#src/adapters/herdr/fleet.ts';
import { paneTokensOf } from '#src/adapters/herdr/json.ts';
import { notesOf } from '#src/recap/domain/coordination.ts';
import type { TokenName, TokenValue } from '#src/protocol/primitives.ts';
import { paneId } from '#test/support/ids.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';

const longNote = 'n'.repeat(81);
const longName = 'x'.repeat(33);

const snapshot = {
    panes: [
        { pane_id: 'w1:p1', tab_id: 'w1:t1', tokens: { note: longNote, 'note-a.b': 'dotted', [longName]: 'long name', ok: 'fine' } },
        { pane_id: 'w1:p2', tab_id: 'w1:t1', tokens: {} },
    ],
    agents: [],
    layouts: [],
    focused_tab_id: 'w1:t1',
};

const served = async <T>(run: () => Promise<T>): Promise<T> => {
    const dir = mkdtempSync(join(tmpdir(), 'recap-herdr-'));
    const path = join(dir, 'herdr.sock');
    const server = createServer((socket) => {
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
            for (const line of chunk.split('\n').filter((entry) => entry !== '')) {
                const request: { id: string; method: string } = JSON.parse(line);
                const replies: Record<string, unknown> = { ping: { protocol: PROTOCOL, version: 'test' }, 'session.snapshot': { snapshot } };
                socket.write(`${JSON.stringify({ id: request.id, result: replies[request.method] ?? {} })}\n`);
            }
        });
    });
    await new Promise<void>((resolve) => { server.listen(path, resolve); });
    const before = process.env['HERDR_SOCKET_PATH'];
    process.env['HERDR_SOCKET_PATH'] = path;
    resetHerdrClients();
    try {
        return await run();
    } finally {
        resetHerdrClients();
        if (before === undefined) { delete process.env['HERDR_SOCKET_PATH']; } else { process.env['HERDR_SOCKET_PATH'] = before; }
        resetHerdrClients();
        server.close();
        rmSync(dir, { recursive: true });
    }
};

const textMap = (tokens: Iterable<readonly [string, string]>): ReadonlyMap<Text, Text> => new Map([...tokens].map(([name, value]): [Text, Text] => [textOf(name), textOf(value)]));

const entriesOf = (tokens: ReadonlyMap<TokenName, TokenValue> | undefined): (readonly [string, string])[] => [...(tokens ?? new Map())].map(([name, value]): readonly [string, string] => [String(name), String(value)]);

test('a snapshot keeps every pane token herdr sent: an 81-char note, a dotted note name and a 33-char name', async () => {
    const result = await served(() => new HerdrFleetPorts(textOf('/state')).snapshot());
    if (result.kind !== 'snapshot') { assert.fail('the snapshot was not read'); }
    const legacy = paneTokensOf(snapshot);
    assert.deepEqual([...result.paneTokens.keys()].map(String), [...legacy.keys()].map(String));
    for (const [pane, tokens] of legacy) {
        const entries = entriesOf(result.paneTokens.get(pane));
        assert.deepEqual(entries, Object.entries(tokens));
        assert.deepEqual(notesOf(textMap(entries)), notesOf(textMap(Object.entries(tokens))));
    }
    const names = entriesOf(result.paneTokens.get(paneId('w1:p1'))).map(([name]) => name);
    assert.deepEqual(names, ['note', 'note-a.b', longName, 'ok']);
    assert.deepEqual(entriesOf(result.paneTokens.get(paneId('w1:p1')))[0], ['note', longNote]);
});
