import { test } from 'node:test';
import assert from 'node:assert/strict';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { duration } from '#src/recap/domain/time.ts';
import { parseNonEmptyText } from '#src/recap/domain/text.ts';
import type { WireChunk } from '#src/adapters/hc-core-wire.ts';
import { HcCoreLines, encodeHcCoreRequest, hcCoreSocketPath, nextBackoff, parseHcCallId, parseHcCoreHello, parseHcCoreMessage, parseHcParams, parseHcSnapshot, parseWireChunk } from '#src/adapters/hc-core-wire.ts';
import { frame } from './fakes/hc-core.ts';

const chunk = (input: string | Buffer): WireChunk => must(parseWireChunk(Buffer.from(input)));
const method = must(parseNonEmptyText('terminal.get'));

test('a request is one JSON-RPC 2.0 line ending in a newline', () => {
    const line = encodeHcCoreRequest(must(parseHcCallId(7)), method, must(parseHcParams({ terminal: 't1' })));
    assert.ok(line.endsWith('\n'));
    assert.deepEqual(JSON.parse(line), { jsonrpc: '2.0', id: 7, method: 'terminal.get', params: { terminal: 't1' } });
});

test('the line codec joins a message split over chunks and splits chunks holding several', () => {
    const lines = new HcCoreLines();
    assert.deepEqual(lines.feed(chunk('{"a":')), []);
    assert.deepEqual(lines.feed(chunk('1}\n{"b":2}\n{"c"')), [{ a: 1 }, { b: 2 }]);
    assert.deepEqual(lines.feed(chunk(':3}\n')), [{ c: 3 }]);
});

test('a multi-byte character cut between two chunks survives', () => {
    const bytes = Buffer.from(`${JSON.stringify({ text: 'café 📝' })}\n`);
    for (let cut = 1; cut < bytes.length; cut += 1) {
        const lines = new HcCoreLines();
        const got = [...lines.feed(chunk(bytes.subarray(0, cut))), ...lines.feed(chunk(bytes.subarray(cut)))];
        assert.deepEqual(got, [{ text: 'café 📝' }], `cut at ${cut}`);
    }
});

test('a malformed or blank line is skipped and the next one still comes', () => {
    const lines = new HcCoreLines();
    assert.deepEqual(lines.feed(chunk('not json\n\n{"ok":true}\n{"torn":\n{"after":1}\n')), [{ ok: true }, { after: 1 }]);
});

test('every scripted frame of the real core parses to its kind', () => {
    const kinds: Record<string, string> = {
        'event:created': 'event', 'event:foreground': 'event', 'event:labels': 'event', 'event:title': 'event', 'event:status': 'event', 'event:turn': 'event',
        'event:keep': 'event', 'event:lost': 'event', 'event:restarted': 'event', 'event:finished': 'event', 'event:removed': 'event', 'event:doc': 'event', 'event:size': 'event',
        heartbeat: 'heartbeat', missed: 'missed', 'error:-32000:not_found': 'fault', hello: 'reply', subscribed: 'reply',
    };
    for (const [name, kind] of Object.entries(kinds)) {
        const parsed = parseHcCoreMessage(frame(name));
        assert.ok(parsed.kind === 'ok' && parsed.value.kind === kind, name);
    }
});

test('an event keeps its terminal, type and data; a doc event has no terminal', () => {
    const created = parseHcCoreMessage(frame('event:created'));
    assert.ok(created.kind === 'ok' && created.value.kind === 'event');
    assert.equal(created.value.type, 'created');
    assert.equal(created.value.terminal, 't1y');
    const doc = parseHcCoreMessage(frame('event:doc'));
    assert.ok(doc.kind === 'ok' && doc.value.kind === 'event' && doc.value.terminal === null);
});

test('a fault carries the JSON-RPC code, data.kind and message', () => {
    const parsed = parseHcCoreMessage(frame('error:-32000:not_found'));
    assert.ok(parsed.kind === 'ok' && parsed.value.kind === 'fault');
    assert.equal(parsed.value.code, -32000);
    assert.equal(parsed.value.reason, 'not_found');
    assert.match(parsed.value.message, /no terminal/);
});

test('something that is not a message is refused', () => {
    for (const input of [null, 3, 'x', [], {}, { id: 1 }, { id: -1, result: 1 }, { method: 'event' }, { method: 'event', params: { seq: 1 } }, { method: 'heartbeat', params: {} }, { method: 'other', params: {} }, { id: 1, error: 5 }]) {
        assert.equal(parseHcCoreMessage(input).kind, 'err', JSON.stringify(input));
    }
});

test('the hello reply gives the generation, the version and the 32 methods; a snapshot needs seq and terminals', () => {
    const hello = parseHcCoreHello(frame('hello')['result']);
    assert.ok(hello.kind === 'ok');
    assert.equal(hello.value.generation, 1);
    assert.equal(hello.value.methods.length, 32);
    assert.ok(hello.value.methods.includes(method));
    assert.equal(parseHcCoreHello({ generation: 1 }).kind, 'err');
    assert.equal(parseHcSnapshot({ seq: 1 }).kind, 'err');
    assert.equal(parseHcSnapshot({ seq: 1, terminals: [] }).kind, 'ok');
});

function pathUnder(env: Record<string, string | undefined>): string {
    const saved = ['HC_SOCKET', 'XDG_RUNTIME_DIR', 'HC_SESSION'].map((key) => [key, process.env[key]] as const);
    for (const [key] of saved) {
        delete process.env[key];
    }
    Object.assign(process.env, env);
    try {
        return hcCoreSocketPath();
    } finally {
        for (const [key, value] of saved) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

test('the socket path: HC_SOCKET wins, then XDG_RUNTIME_DIR, then /run/user/<uid>, with HC_SESSION or default', () => {
    const uid = String(process.getuid?.() ?? 0);
    assert.equal(pathUnder({ HC_SOCKET: '/x/y.sock', XDG_RUNTIME_DIR: '/run/q', HC_SESSION: 's' }), '/x/y.sock');
    assert.equal(pathUnder({ XDG_RUNTIME_DIR: '/run/q', HC_SESSION: 'sp' }), '/run/q/herdr-core/sp.sock');
    assert.equal(pathUnder({ XDG_RUNTIME_DIR: '/run/q' }), '/run/q/herdr-core/default.sock');
    assert.equal(pathUnder({}), `/run/user/${uid}/herdr-core/default.sock`);
    assert.equal(pathUnder({ HC_SOCKET: '', XDG_RUNTIME_DIR: '', HC_SESSION: '' }), `/run/user/${uid}/herdr-core/default.sock`);
});

test('the backoff doubles from its base and stops at its cap', () => {
    const base = duration(100);
    const cap = duration(1000);
    const delays = [0, 1, 2, 3, 4, 40].map((failures) => nextBackoff(must(parseCount(failures)), base, cap));
    assert.deepEqual(delays, [100, 200, 400, 800, 1000, 1000]);
});
