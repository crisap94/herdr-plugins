import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BEL, FRAME_END, FRAME_HOME, LINE_END, MOUSE_OFF, MOUSE_ON, RESET_SGR, SCREEN_OFF, SCREEN_ON, TITLE_OSC } from '#src/adapters/os/tui.ts';
import { LineSplitter, decodeClient, decodeDaemon, encode } from '#src/wire/view/codec.ts';
import { initialConn, step } from '#src/wire/view/connection.ts';
import type { Conn, ConnEvent, ConnState, Facts } from '#src/wire/view/connection.ts';
import { intentOf, localOf } from '#src/wire/view/keys.ts';
import { ENTER, LEAVE, paintOf } from '#src/wire/view/paint.ts';
import { DEFAULT_TEXTS, LIMITS, PROTOCOL } from '#src/wire/view/protocol.ts';
import type { IntentMessage, Key, Role, Tap } from '#src/wire/view/protocol.ts';
import { hookShimPath, hooksSocketPath, viewSocketPath } from '#src/wire/paths.ts';
import { readTranscript } from '#test/contracts/wire/fakes/transcript.ts';

const FIXTURES = new URL('./wire/fixtures/view/', import.meta.url);

const fixture = (name: string): string => readFileSync(new URL(name, FIXTURES), 'utf8');

const tableOf = (name: string): readonly (readonly string[])[] =>
    fixture(name).split('\n').filter((line) => line.length > 0).slice(1).map((line) => line.split('\t'));

const wireItems = (name: string): readonly { readonly line: number; readonly kind: 'C' | 'D'; readonly text: string }[] =>
    readTranscript(fileURLToPath(new URL(name, FIXTURES))).items.flatMap((item) => (item.kind === 'C' || item.kind === 'D' ? [item] : []));

const NOT_A_MESSAGE: ReadonlySet<string> = new Set([
    'malformed.transcript:this line is not json',
    'unknown-type.transcript:{"t":"zoom","level":2}',
    'unknown-type.transcript:{"t":"glow","level":2}',
]);

const LINES_IN_TRANSCRIPTS = 91;

const VALID_CLIENT = [
    '{"t":"hello","protocol":1,"version":"9.9.9","role":"column","tab":"t1","pane":null,"cols":80,"rows":24,"colour":true}',
    '{"t":"hello","protocol":1,"version":"unknown","role":"modal","tab":"t2","pane":"p7","cols":40,"rows":3,"colour":false}',
    '{"t":"resize","cols":100,"rows":30}',
    '{"t":"key","key":"\\u001b[B"}',
    '{"t":"tap","col":3,"row":4}',
    '{"t":"intent","intent":"show-modal"}',
    '{"t":"ping"}',
];

const VALID_DAEMON = [
    '{"t":"welcome","protocol":1,"version":"9.9.9","title":"tab-recap","texts":{"connecting":"a","down":"b","downHint":"c","mismatch":"d"}}',
    '{"t":"frame","lines":["\\u001b[1mtab\\u001b[0m","",""]}',
    '{"t":"pong"}',
    '{"t":"bye","why":"protocol","protocol":2,"version":"4.0.0"}',
];

test('every valid client line decodes and encodes back to the same bytes', () => {
    for (const line of VALID_CLIENT) {
        const decoded = decodeClient(line);
        assert.ok(!('kind' in decoded), line);
        assert.equal(encode(decoded), `${line}\n`);
    }
});

test('every valid daemon line decodes and encodes back to the same bytes', () => {
    for (const line of VALID_DAEMON) {
        const decoded = decodeDaemon(line);
        assert.ok(!('kind' in decoded), line);
        assert.equal(encode(decoded), `${line}\n`);
    }
});

test('encode writes the keys in the order of the interface, whatever order the object has', () => {
    assert.equal(encode({ rows: 30, cols: 100, t: 'resize' }), '{"t":"resize","cols":100,"rows":30}\n');
});

test('every C and D line of every transcript decodes and encodes back to the same bytes', () => {
    const names = readdirSync(FIXTURES).filter((name) => name.endsWith('.transcript'));
    assert.equal(names.length, 13);
    let count = 0;
    for (const name of names) {
        for (const item of wireItems(name)) {
            const decoded = item.kind === 'C' ? decodeClient(item.text) : decodeDaemon(item.text);
            assert.ok(!('kind' in decoded) || NOT_A_MESSAGE.has(`${name}:${item.text}`), `${name}:${item.line}`);
            assert.ok('kind' in decoded || encode(decoded) === `${item.text}\n`, `${name}:${item.line}`);
            count += 1;
        }
    }
    assert.equal(count, LINES_IN_TRANSCRIPTS);
});

test('every line of invalid.ndjson is rejected as malformed with its reason', () => {
    const rows = fixture('invalid.ndjson').split('\n').filter((line) => line.length > 0);
    assert.ok(rows.length > 0);
    for (const row of rows) {
        const { side, line, why } = JSON.parse(row);
        const decoded = side === 'client' ? decodeClient(line) : decodeDaemon(line);
        assert.deepEqual(decoded, { kind: 'malformed', why }, row);
    }
});

test('an unknown type, or a type of the other side, is ignored and not malformed (rule V3)', () => {
    assert.deepEqual(decodeClient('{"t":"zoom","level":2}'), { kind: 'ignored', t: 'zoom' });
    assert.deepEqual(decodeClient(VALID_DAEMON[2] ?? ''), { kind: 'ignored', t: 'pong' });
    assert.deepEqual(decodeDaemon(VALID_CLIENT[6] ?? ''), { kind: 'ignored', t: 'ping' });
});

test('an unknown field is ignored and dropped on encode', () => {
    const decoded = decodeClient('{"t":"key","key":"j","extra":true}');
    assert.ok(!('kind' in decoded));
    assert.equal(encode(decoded), '{"t":"key","key":"j"}\n');
});

test('keys.tsv holds for intentOf and localOf', () => {
    const rows = tableOf('keys.tsv');
    assert.equal(rows.length, 78);
    for (const [role, input, intent, local] of rows) {
        const message: Key | Tap | IntentMessage = JSON.parse(input ?? '');
        const shown = role as Role;
        assert.deepEqual(intentOf(shown, message), JSON.parse(intent ?? ''), `${role} ${input}`);
        const expected = local === 'exit' ? 'exit' : null;
        assert.equal(message.t === 'key' ? localOf(shown, message.key) : null, expected, `${role} ${input}`);
    }
});

test('states.tsv holds for step', () => {
    const rows = tableOf('states.tsv');
    assert.equal(rows.length, 29);
    for (const [state, attempt, failing, hasFrame, event, facts, next, effects] of rows) {
        const now: Facts = JSON.parse(facts ?? '');
        const conn: Conn = {
            state: state as ConnState,
            attempt: Number(attempt),
            failingSince: failing === '-' ? null : now.now - Number(failing),
            hasFrame: hasFrame === 'true',
        };
        const result = step(conn, JSON.parse(event ?? '') as ConnEvent, now);
        assert.equal(result.conn.state, next, `${state} ${event} ${facts}`);
        assert.deepEqual(result.effects, JSON.parse(effects ?? ''), `${state} ${event} ${facts}`);
    }
});

test('a welcome resets the attempt counter and the failure clock', () => {
    const facts: Facts = { now: 5000, role: 'column', ownVersion: '1.0.0', diskVersion: '1.0.0', rolledFor: null, canExec: true };
    const failing = step(step(initialConn, { kind: 'connect-failed' }, facts).conn, { kind: 'connect-failed' }, facts).conn;
    assert.equal(failing.attempt, 2);
    const welcomed = step(failing, { kind: 'welcome', protocol: PROTOCOL, version: '1.0.0' }, facts).conn;
    assert.deepEqual(welcomed, { state: 'connected', attempt: 0, failingSince: null, hasFrame: false });
});

test('paint.txt holds for paintOf, colour first, plain second', () => {
    const [colour, plain] = fixture('paint.txt').split('\n').map((line) => (line.length > 0 ? JSON.parse(line) : ''));
    assert.equal(paintOf('Recap', ['a', 'b'], true), colour);
    assert.equal(paintOf('Recap', ['a', 'b'], false), plain);
});

test('paintOf, ENTER and LEAVE are byte-identical to the column pane of main', () => {
    const lines = ['a', 'b'];
    const frame = lines.map((line) => ` ${line}${RESET_SGR}${LINE_END}`).join('\r\n');
    assert.equal(paintOf('Recap', lines, true), `${TITLE_OSC}Recap${BEL}${FRAME_HOME}${frame}${FRAME_END}`);
    assert.equal(ENTER('column', 'T'), `${SCREEN_ON}${MOUSE_ON}${TITLE_OSC}T${BEL}`);
    assert.equal(ENTER('modal', 'T'), `${SCREEN_ON}${TITLE_OSC}T${BEL}`);
    assert.equal(LEAVE, `${MOUSE_OFF}${SCREEN_OFF}`);
});

test('the line splitter buffers a partial line and splits a chunk into lines', () => {
    const splitter = new LineSplitter();
    assert.deepEqual(splitter.push(Buffer.from('{"t":"pi')), []);
    assert.deepEqual(splitter.push(Buffer.from('ng"}\n{"t":"pong"}\n{"t"')), ['{"t":"ping"}', '{"t":"pong"}']);
});

test('the line splitter keeps a character split across two chunks whole', () => {
    const splitter = new LineSplitter();
    const bytes = Buffer.from('é\n');
    assert.deepEqual(splitter.push(bytes.subarray(0, 1)), []);
    assert.deepEqual(splitter.push(bytes.subarray(1)), ['é']);
});

test('a line over LIMITS.lineBytes yields malformed once, then the next line is read', () => {
    const splitter = new LineSplitter();
    const long = Buffer.alloc(LIMITS.lineBytes + 1, 0x61);
    assert.deepEqual(splitter.push(long), [{ kind: 'malformed', why: 'too-long' }]);
    assert.deepEqual(splitter.push(Buffer.from('aaa')), []);
    assert.deepEqual(splitter.push(Buffer.from('a\n{"t":"ping"}\n')), ['{"t":"ping"}']);
});

test('the default texts are four non-empty English lines', () => {
    assert.deepEqual(Object.keys(DEFAULT_TEXTS), ['connecting', 'down', 'downHint', 'mismatch']);
    assert.ok(Object.values(DEFAULT_TEXTS).every((text) => text.length > 0));
});

test('the socket and shim paths sit in the state directory', () => {
    assert.equal(viewSocketPath('/state'), '/state/view.sock');
    assert.equal(hooksSocketPath('/state'), '/state/hooks.sock');
    assert.equal(hookShimPath('/state'), '/state/hook.sh');
});
