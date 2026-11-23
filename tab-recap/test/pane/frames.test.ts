import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import type { Store } from '#src/adapters/db/database.ts';
import { expandedScreen } from '#src/column/expanded-modal.ts';
import { loadSettings } from '#src/daemon/config.ts';
import type { Settings } from '#src/daemon/config.ts';
import { worktreeSwitch } from '#src/daemon/worktree-switch.ts';
import { frameSource } from '#src/daemon/view/frames.ts';
import type { FrameParts, Screen } from '#src/daemon/view/frames.ts';
import { glowCache } from '#src/daemon/view/glow-cache.ts';
import type { GlowCache, GlowSpawn } from '#src/daemon/view/glow-cache.ts';
import { notesByPaneOf, warningTextsOf } from '#src/extensions/load.ts';
import { storedNotes } from '#src/extensions/stored-notes.ts';
import { messagesFor } from '#src/i18n/index.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { parseText, type Text, textOf } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { footer, present, presentBar } from '#src/recap/render/present.ts';
import type { ColumnView, Markdown } from '#src/recap/render/present.ts';
import { coloured, plain } from '#src/recap/render/wrap.ts';
import type { Style } from '#src/recap/render/wrap.ts';
import type { Role } from '#src/wire/view/protocol.ts';
import { recapRunningOf, type TabRecap } from '#src/ports/recap-records.ts';
import { cursor, memoryStore, storeRead } from '#test/db/support.ts';
import { usdOf } from '#src/recap/domain/usd.ts';
import { paneIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';

const NOW = 1_800_000_000_000;
const TAB = 'w1:t1';
const GLOW_OUTPUT = '\u001b[1mglow one\u001b[0m\nglow two\n';

const cases = (['column', 'modal', 'bar'] as const).flatMap((role) => [
    { cols: 40, rows: 12 },
    { cols: 60, rows: 20 },
    { cols: 100, rows: 30 },
].flatMap(({ cols, rows }) => [0, 3].flatMap((scroll) => [true, false].map((colour) => ({ role, cols, rows, scroll, colour })))));

const settle = (): Promise<void> => new Promise((resolve) => { setImmediate(resolve); });

const recapOf = (): TabRecap => ({
    tab: tabId(TAB),
    lanes: [cursor('w1:p1')],
    tasks: [{ id: textOf('t1'), name: textOf('Build'), lanes: [paneIdOf('w1:p1')], sections: null, markdown: textOf('## Done\n\n- shipped the frame source') }],
    at: instant(NOW - 60_000),
    running: recapRunningOf(false),
    backend: textOf('claude'),
    error: null,
    costUsd: usdOf(0),
    language: textOf('en'),
});

const fixture = (spawn: GlowSpawn): { store: Store; config: Settings; glow: GlowCache; parts: FrameParts; source: ReturnType<typeof frameSource> } => {
    const base = memoryStore();
    base.views.writeTab({ tab: TAB, column: null, at: NOW - 3_600_000, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'orchestrator', cwd: null, web: { base: 'https://git.example/acme/shop', forge: 'gitlab', branch: 'main' } }] });
    const recap = recapOf();
    const store: Store = {
        ...base,
        records: {
            readRecap: () => recap,
            lastRunOf: (tab) => base.records.lastRunOf(tab),
            beginRun: (tab, backend, at) => { base.records.beginRun(tab, backend, at); },
            recordRun: (run) => { base.records.recordRun(run); },
            failRun: (run) => { base.records.failRun(run); },
            advance: (move) => { base.records.advance(move); },
        },
    };
    const config = loadSettings();
    const glow = glowCache(spawn);
    const parts: FrameParts = { store, glow, clock: { now: () => instant(NOW) }, version: () => null, config: () => config };
    return { store, config, glow, parts, source: frameSource(parts) };
};

const instantGlow: GlowSpawn = async (): Promise<Text | null> => must(parseText(GLOW_OUTPUT));

const viewOf = (store: Store, config: Settings, style: Style): ColumnView => {
    const stored = store.views.readTab(TAB);
    const extensions = [storedNotes({ statuses: store.worktrees, notes: store.paneNotes, alerts: store.paneAlerts, gitNote: worktreeSwitch })];
    return {
        tab: stored,
        recap: storeRead(store.records.readRecap(tabId(TAB))),
        notes: notesByPaneOf(extensions, stored?.lanes, config.locale),
        warnings: warningTextsOf(extensions, config.locale),
        now: NOW,
        messages: messagesFor(config.locale),
        version: null,
        compactHint: config.compaction.hint,
        compactions: store.compactions.shownFor(tabId(TAB)),
        style,
    };
};

const markdownDirect = (glow: GlowCache, colour: boolean): Markdown => (markdown, width) => {
    const drawn = glow.render(must(parseText(markdown)), must(parseCount(width)));
    if (drawn === null) {
        return null;
    }
    return colour ? drawn : drawn.map(stripVTControlCharacters);
};

const windowed = (body: readonly string[], rows: number, scroll: number, last: string): { lines: string[]; top: number } => {
    const room = Math.max(3, rows) - 1;
    const top = Math.max(0, Math.min(scroll, body.length - room));
    const shown = body.slice(top, top + room);
    while (shown.length < room) {
        shown.push('');
    }
    return { lines: [...shown, last], top };
};

interface Expect {
    readonly role: Role;
    readonly fx: ReturnType<typeof fixture>;
    readonly view: ColumnView;
    readonly cols: number;
    readonly rows: number;
    readonly scroll: number;
    readonly colour: boolean;
}

const expectedFor = ({ role, fx, view, cols, rows, scroll, colour }: Expect): { lines: readonly string[]; top: number } => {
    const style = colour ? coloured : plain;
    const messages = messagesFor(fx.config.locale);
    const width = Math.max(10, cols - 2);
    if (role === 'bar') {
        return { lines: presentBar(view, width), top: 0 };
    }
    if (role === 'modal') {
        return windowed(expandedScreen(fx.store)(view, width), rows, scroll, footer(width, 'modal', messages, style));
    }
    return windowed(present(view, width, markdownDirect(fx.glow, colour)), rows, scroll, footer(width, 'column', messages, style));
};

for (const { role, cols, rows, scroll, colour } of cases) {
    test(`${role} ${cols}x${rows} scroll ${scroll} ${colour ? 'colour' : 'plain'} matches the direct render`, async () => {
        const fx = fixture(instantGlow);
        const style = colour ? coloured : plain;
        const screen: Screen = { role, tab: tabId(TAB), cols: must(parseCount(cols)), rows: must(parseCount(rows)), style, scroll: must(parseCount(scroll)) };
        fx.source.lines(screen);
        await settle();

        const frame = fx.source.lines(screen);
        const expected = expectedFor({ role, fx, view: viewOf(fx.store, fx.config, style), cols, rows, scroll, colour });

        assert.deepEqual(frame.lines, expected.lines.map((line) => must(parseText(line))));
        assert.equal(frame.scroll, expected.top);
        assert.equal(frame.awaiting.length, 0);
    });
}

test('a slow glow run gives pending with plain lines, then onReady and the glow lines', async () => {
    const resolvers: Array<(output: Text | null) => void> = [];
    const slow: GlowSpawn = () => new Promise((resolve) => { resolvers.push(resolve); });
    const fx = fixture(slow);
    const screen: Screen = { role: 'column', tab: tabId(TAB), cols: must(parseCount(60)), rows: must(parseCount(20)), style: coloured, scroll: must(parseCount(0)) };

    const first = fx.source.lines(screen);
    assert.equal(first.awaiting.length, 1);
    const firstLines = first.lines.map(String);
    assert.ok(firstLines.some((line) => line.includes('shipped the frame source')), 'the plain markdown is drawn while the glow runs');
    assert.ok(!firstLines.some((line) => line.includes('glow one')));

    let ready = 0;
    fx.glow.onReady(() => {
        ready += 1;
    });
    resolvers.at(0)?.(must(parseText(GLOW_OUTPUT)));
    await settle();
    assert.equal(ready, 1);

    const second = fx.source.lines(screen);
    assert.equal(second.awaiting.length, 0);
    const secondLines = second.lines.map((line) => stripVTControlCharacters(String(line)));
    assert.ok(secondLines.some((line) => line === 'glow one'));
    assert.ok(secondLines.some((line) => line === 'glow two'));
    assert.ok(second.lines.some((line) => String(line).includes('\u001b[1m')), 'the glow lines keep their colour');
});
