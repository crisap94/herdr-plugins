import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeClient, decodeDaemon, encode } from '#src/wire/view/codec.ts';
import { intentOf } from '#src/wire/view/keys.ts';
import type { Intent } from '#src/wire/view/keys.ts';
import { PROTOCOL } from '#src/wire/view/protocol.ts';
import type { Role } from '#src/wire/view/protocol.ts';
import { viewSocketPath } from '#src/wire/paths.ts';
import { startFakeViewDaemon } from '#test/contracts/wire/fakes/fake-view-daemon.ts';
import { connectFakePane } from '#test/contracts/wire/fakes/fake-view-pane.ts';
import { fixtureClamp, fixtureIntents, fixtureRender } from '#test/contracts/wire/fakes/fixture-render.ts';
import { DEFAULT_SETTINGS, fakeClock, playAsDaemon, playAsPane, readTranscript } from '#test/contracts/wire/fakes/transcript.ts';
import type { Item, Transcript } from '#test/contracts/wire/fakes/transcript.ts';

const FOLDER = fileURLToPath(new URL('./wire/fixtures/view/', import.meta.url));

const NAMES = readdirSync(FOLDER).filter((name) => name.endsWith('.transcript')).toSorted();

const EXPECTED = [
    'daemon-down', 'handshake', 'keys', 'malformed', 'modal-close', 'ping', 'protocol-differs',
    'resize', 'shutdown-reconnect', 'tap', 'unknown-type', 'version-differs-roll', 'version-differs-rolled',
];

const transcriptOf = (name: string): Transcript => readTranscript(join(FOLDER, name));

const withSocketDir = async (run: (socketPath: string) => Promise<void>): Promise<string> => {
    const directory = mkdtempSync(join(tmpdir(), 'wv-'));
    try {
        await run(viewSocketPath(directory));
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
    return directory;
};

interface View { readonly role: Role; readonly tab: string; readonly cols: number; readonly rows: number; readonly scroll: number; readonly last: string }

const scrolled = (view: View, intent: Intent | null): number => {
    if (intent?.kind === 'scroll') {
        return fixtureClamp(view.rows, view.scroll + intent.lines);
    }
    if (intent?.kind === 'page') {
        return fixtureClamp(view.rows, view.scroll + intent.pages * (Math.max(3, view.rows) - 2));
    }
    if (intent?.kind === 'jump') {
        return intent.to === 'top' ? 0 : fixtureClamp(view.rows, Number.MAX_SAFE_INTEGER);
    }
    return view.scroll;
};

const afterClient = (view: View | null, text: string): View | null => {
    const message = decodeClient(text);
    if ('kind' in message || message.t === 'ping') {
        return view;
    }
    if (message.t === 'hello') {
        return { role: message.role, tab: message.tab, cols: message.cols, rows: message.rows, scroll: 0, last: '' };
    }
    if (view === null) {
        return view;
    }
    if (message.t === 'resize') {
        return { ...view, cols: message.cols, rows: message.rows, scroll: fixtureClamp(message.rows, view.scroll) };
    }
    return { ...view, scroll: scrolled(view, intentOf(view.role, message)) };
};

const framesOf = (t: Transcript): readonly { readonly line: number; readonly actual: string; readonly expected: string; readonly last: string }[] => {
    const frames: { line: number; actual: string; expected: string; last: string }[] = [];
    let view: View | null = null;
    const walk = (item: Item): void => {
        if (item.kind === 'open') {
            view = null;
        } else if (item.kind === 'C') {
            view = afterClient(view, item.text);
        } else if (item.kind === 'D' && view !== null && item.text.startsWith('{"t":"frame"')) {
            const current: View = view;
            const expected = encode({ t: 'frame', lines: fixtureRender(current.role, current.tab, current.cols, current.rows, current.scroll) }).trimEnd();
            frames.push({ line: item.line, actual: item.text, expected, last: current.last });
            view = { ...current, last: item.text };
        }
    };
    t.items.forEach(walk);
    return frames;
};

const versionsOf = (t: Transcript): readonly { readonly line: number; readonly found: string; readonly wanted: string }[] =>
    t.items.flatMap((item) => {
        if (item.kind !== 'C' && item.kind !== 'D') {
            return [];
        }
        const message = item.kind === 'C' ? decodeClient(item.text) : decodeDaemon(item.text);
        if ('kind' in message) {
            return [];
        }
        const { settings } = t;
        if (message.t === 'hello') {
            return [{ line: item.line, found: `${message.version} ${message.tab}`, wanted: `${settings.paneVersion} ${settings.tab}` }];
        }
        if (message.t === 'welcome' || message.t === 'bye') {
            return [{ line: item.line, found: `${message.version} ${message.protocol}`, wanted: `${settings.daemonVersion} ${settings.daemonProtocol}` }];
        }
        return [];
    });

const otherFrame = (item: Item): Item =>
    (item.kind === 'D' && item.text.startsWith('{"t":"frame"') ? { line: item.line, kind: 'D', text: '{"t":"frame","lines":["other"]}' } : item);

const wrongCheck = (item: Item): Item => {
    if (item.kind === 'intent') {
        return { line: item.line, kind: 'intent', word: 'hide' };
    }
    if (item.kind === 'effect') {
        return { line: item.line, kind: 'effect', word: 'reexec' };
    }
    return item.kind === 'state' ? { line: item.line, kind: 'state', state: 'daemon-down' } : item;
};

test('the view fixtures hold the thirteen transcripts of WC 5.1', () => {
    assert.deepEqual(NAMES, EXPECTED.map((name) => `${name}.transcript`));
});

for (const name of NAMES) {
    test(`${name}: the pane player and the daemon player agree over a unix socket in a temporary directory`, async () => {
        const t = transcriptOf(name);
        const directory = await withSocketDir(async (socketPath) => {
            const [daemon, pane] = await Promise.all([playAsDaemon(t, socketPath, fakeClock()), playAsPane(t, socketPath, fakeClock())]);
            assert.deepEqual({ daemon, pane }, { daemon: [], pane: [] });
        });
        assert.equal(existsSync(directory), false);
    });
}

test('every frame of every transcript is the fixture renderer\'s frame for that connection, and never a repeat of the last one', () => {
    let count = 0;
    for (const name of NAMES) {
        for (const frame of framesOf(transcriptOf(name))) {
            assert.equal(frame.actual, frame.expected, `${name}:${frame.line}`);
            assert.notEqual(frame.actual, frame.last, `${name}:${frame.line} repeats the last frame`);
            count += 1;
        }
    }
    assert.equal(count, 25);
});

test('the hello lines carry the pane version and tab of the settings, the welcome and bye lines the daemon version and protocol', () => {
    for (const name of NAMES) {
        for (const pair of versionsOf(transcriptOf(name))) {
            assert.equal(pair.found, pair.wanted, `${name}:${pair.line}`);
        }
    }
});

test('the runner bites: a daemon that sends another frame than the pane expects is a mismatch on both sides', async () => {
    const t = transcriptOf('handshake.transcript');
    const changed: Transcript = { ...t, items: t.items.map(otherFrame) };
    await withSocketDir(async (socketPath) => {
        const [daemon, pane] = await Promise.all([playAsDaemon(changed, socketPath, fakeClock()), playAsPane(t, socketPath, fakeClock())]);
        assert.deepEqual(daemon, []);
        assert.deepEqual(pane.map((mismatch) => mismatch.actual), ['{"t":"frame","lines":["other"]}']);
    });
});

test('the runner bites: a state, an intent or an effect the transcript does not reach is a mismatch', async () => {
    const t = transcriptOf('modal-close.transcript');
    const changed: Transcript = { ...t, items: t.items.map(wrongCheck) };
    await withSocketDir(async (socketPath) => {
        const [daemon, pane] = await Promise.all([playAsDaemon(changed, socketPath, fakeClock()), playAsPane(changed, socketPath, fakeClock())]);
        assert.deepEqual(daemon.map((mismatch) => `${mismatch.expected} ${mismatch.actual}`), ['hide compact']);
        assert.deepEqual(pane.map((mismatch) => `${mismatch.expected} ${mismatch.actual}`), ['daemon-down connected', 'reexec [exit]']);
    });
});

test('readTranscript applies the defaults of WC 5.1 and reads every kind of line', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wv-'));
    try {
        const path = join(directory, 'all.transcript');
        writeFileSync(path, '# comment\n@ role modal\n! open\nC {"t":"ping"}\nD {"t":"pong"}\n! close pane\n! close daemon\n! state connecting\n! intent hide\n! effect exit\n! wait 250\n');
        const t = readTranscript(path);
        assert.equal(t.name, 'all');
        assert.deepEqual(t.settings, { ...DEFAULT_SETTINGS, role: 'modal' });
        assert.deepEqual(DEFAULT_SETTINGS, { daemonVersion: '9.9.9', paneVersion: '9.9.9', diskVersion: '9.9.9', daemonProtocol: 1, role: 'column', tab: 't1', rolledFor: null });
        assert.deepEqual(t.items.map((item) => item.kind), ['open', 'C', 'D', 'close', 'close', 'state', 'intent', 'effect', 'wait']);
        assert.deepEqual(t.items.at(-1), { line: 11, kind: 'wait', ms: 250 });
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test('readTranscript rejects a line outside the grammar and an unknown setting', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wv-'));
    try {
        const cases = ['! jump 3\n', '! state asleep\n', '! close both\n', '! wait soon\n', '@ colour on\n', '@ role window\n', 'X {"t":"ping"}\n'];
        for (const [index, text] of cases.entries()) {
            const path = join(directory, `bad-${index}.transcript`);
            writeFileSync(path, text);
            assert.throws(() => readTranscript(path), /line 1/u, text);
        }
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test('the fake clock starts where it is told and moves only when advanced', () => {
    const clock = fakeClock(100);
    assert.equal(clock.now(), 100);
    clock.advance(250);
    assert.equal(clock.now(), 350);
});

test('the fixture renderer clamps the scroll and keeps width and height at their minimums', () => {
    assert.deepEqual(fixtureRender('column', 't1', 40, 6, 99), ['t1 line 8', 't1 line 9', 't1 line 10', 't1 line 11', 't1 line 12', 'column t1 40x6 @7']);
    assert.deepEqual(fixtureRender('modal', 't2', 4, 1, 0), ['t2 line 1', 't2 line 2', 'modal t2 4']);
    assert.deepEqual(fixtureRender('bar', 't1', 40, 1, 0), ['t1 bar 40x1']);
    assert.equal(fixtureClamp(6, -3), 0);
    const intents = fixtureIntents();
    intents.sink({ kind: 'refresh' });
    assert.deepEqual(intents.seen, [{ kind: 'refresh' }]);
});

test('the fake pane and the fake daemon speak the wire: hello in, scripted answers out, drop ends the connection', async () => {
    await withSocketDir(async (socketPath) => {
        const daemon = await startFakeViewDaemon(socketPath, (message) => {
            if (message.t === 'hello') {
                return [{ t: 'frame', lines: fixtureRender(message.role, message.tab, message.cols, message.rows, 0) }];
            }
            return message.t === 'ping' ? [{ t: 'pong' }] : [];
        });
        const pane = await connectFakePane(socketPath, { role: 'modal', tab: 't9' });
        assert.deepEqual(await pane.next(), { t: 'frame', lines: fixtureRender('modal', 't9', 40, 6, 0) });
        pane.send({ t: 'ping' });
        assert.deepEqual(await pane.next(), { t: 'pong' });
        assert.deepEqual(daemon.received, [{ t: 'hello', protocol: PROTOCOL, version: '9.9.9', role: 'modal', tab: 't9', pane: null, cols: 40, rows: 6, colour: false }, { t: 'ping' }]);
        daemon.send({ t: 'bye', why: 'shutdown', protocol: PROTOCOL, version: '9.9.9' });
        assert.deepEqual(await pane.next(), { t: 'bye', why: 'shutdown', protocol: PROTOCOL, version: '9.9.9' });
        daemon.drop();
        await assert.rejects(pane.next(), /closed/u);
        pane.close();
        await daemon.stop();
    });
});
