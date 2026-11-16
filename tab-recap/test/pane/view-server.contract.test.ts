import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVersion, type Line } from '#src/daemon/slots.ts';
import { startViewServer, parseSocketPath, type ViewServer } from '#src/daemon/view/server.ts';
import type { Frame, FrameSource, Screen } from '#src/daemon/view/frames.ts';
import { runIntent, type IntentParts, type IntentSink } from '#src/daemon/view/intents.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { DEFAULT_TEXTS } from '#src/wire/view/protocol.ts';
import { fixtureClamp, fixtureRender } from '#test/contracts/wire/fakes/fixture-render.ts';
import { fakeClock, playAsPane, readTranscript } from '#test/contracts/wire/fakes/transcript.ts';
import type { Mismatch, Transcript } from '#test/contracts/wire/fakes/transcript.ts';

const FOLDER = fileURLToPath(new URL('../contracts/wire/fixtures/view/', import.meta.url));

const EXCLUDED: ReadonlyMap<string, string> = new Map([
    ['daemon-down.transcript', 'the pane finds no listener, so no server runs; a server cannot be down while it answers'],
]);

const LOCAL: ReadonlySet<string> = new Set(['scroll', 'page', 'jump']);

const frames: FrameSource = {
    lines: (screen: Screen): Frame => {
        const cols = Number(screen.cols);
        const rows = Number(screen.rows);
        const scroll = Number(screen.scroll);
        const lines: Text[] = fixtureRender(screen.role, screen.tab, cols, rows, scroll).map((line) => must(parseText(line)));
        return {
            lines,
            scroll: must(parseCount(fixtureClamp(rows, scroll))),
            awaiting: [],
        };
    },
};

const adapt = (t: Transcript): Transcript => {
    if (t.name !== 'unknown-type') {
        return t;
    }
    return { ...t, items: t.items.filter((item) => !(item.kind === 'D' && item.text.includes('"t":"glow"'))) };
};

const pause = (): Promise<void> => new Promise((resolve) => {
    setImmediate(resolve);
});

const parts = (launched: unknown[], logged: Line[]): IntentParts => ({
    observe: () => undefined,
    show: () => Promise.resolve({ kind: 'done' }),
    compact: {
        askNote: () => Promise.resolve({ kind: 'done' }),
        queue: () => ({ kind: 'done' }),
    },
    compactNote: () => 'skip',
    launch: (launch) => {
        launched.push(launch);
    },
    log: (line) => {
        logged.push(line);
    },
});

interface Run {
    readonly mismatches: Mismatch[];
    readonly sunk: string[];
    readonly logged: Line[];
}

async function sweep(t: Transcript): Promise<Run> {
    const dir = mkdtempSync(join(tmpdir(), 'vs-'));
    const socketPath = join(dir, 'view.sock');
    const sunk: string[] = [];
    const launched: unknown[] = [];
    const logged: Line[] = [];
    const inner = runIntent(parts(launched, logged));
    const sink: IntentSink = (action, connection) => {
        sunk.push(action.kind);
        inner(action, connection);
    };
    const start = (): Promise<ViewServer | null> => startViewServer({
        socketPath: parseSocketPath(socketPath),
        frames,
        intents: sink,
        texts: () => DEFAULT_TEXTS,
        version: parseVersion(t.settings.daemonVersion),
        log: (line) => {
            logged.push(line);
        },
    });
    const first = await start();
    if (first === null) {
        throw new Error(`${t.name}: the view socket was not bound`);
    }
    let live: ViewServer = first;
    const driver = t.name === 'shutdown-reconnect'
        ? (async (): Promise<void> => {
            while (live.connections() !== 1) {
                await pause();
            }
            await live.stop('shutdown');
            const next = await start();
            if (next === null) {
                throw new Error('shutdown-reconnect: the view socket was not rebound');
            }
            live = next;
        })()
        : Promise.resolve();
    try {
        const mismatches = await playAsPane(t, socketPath, fakeClock());
        await driver;
        return { mismatches, sunk, logged };
    } finally {
        await live.stop('shutdown');
        rmSync(dir, { recursive: true, force: true });
    }
}

const NAMES = readdirSync(FOLDER).filter((name) => name.endsWith('.transcript')).toSorted();

for (const name of NAMES) {
    const reason = EXCLUDED.get(name);
    if (reason !== undefined) {
        test(`view server transcript ${name} is excluded: ${reason}`, { skip: reason }, () => undefined);
        continue;
    }
    test(`view server speaks the ${name} transcript`, async () => {
        const t = adapt(readTranscript(join(FOLDER, name)));
        const run = await sweep(t);
        assert.deepEqual(run.mismatches, [], `${name} mismatches`);
        const expected = t.items
            .flatMap((item) => (item.kind === 'intent' ? [item.word] : []))
            .filter((word) => !LOCAL.has(word));
        assert.deepEqual(run.sunk, expected, `${name} intents reaching the sink`);
    });
}
