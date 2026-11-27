import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { Method } from '@stateforge-labs/herdr-sdk';
import { databaseFile } from '#src/adapters/db/database.ts';
import type { Directory } from '@stateforge-labs/session-ledger';
import { prepareStateStore, viewWorld, type Pane, type ViewWorld } from '../support/view-world.ts';
import { NOW, VERSION } from '../support/view-seeds.ts';

const ESC = String.fromCodePoint(0x1b);
const CTRL_C = String.fromCodePoint(3);
const CTRL_U = String.fromCodePoint(0x15);
const DELETE = String.fromCodePoint(0x7f);
const LIMIT = 280;

type Row = readonly [string, string, string | null, string | null];

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const requests = (world: ViewWorld): readonly Row[] => {
    const db = new Database(databaseFile(world.stateDir as Directory), { readonly: true });
    try {
        return db.prepare('SELECT kind, target, pane, note FROM request ORDER BY at, id').all().map((row) => {
            const found = row as Record<string, unknown>;
            return [textOrNull(found['kind']) ?? '', textOrNull(found['target']) ?? '', textOrNull(found['pane']), textOrNull(found['note'])] satisfies Row;
        });
    } finally {
        db.close();
    }
};

const typed = async (pane: Pane, keys: readonly string[]): Promise<void> => {
    for (const key of keys) {
        await pane.press(key);
    }
};

const noteLine = (pane: Pane): string => pane.screen()?.plain[3] ?? '';

describe('the compact popup of an agent', () => {
    let world: ViewWorld;

    before(async () => {
        world = await viewWorld({ now: NOW, version: VERSION });
        world.herdr.reply(Method.AgentGet, { type: 'agent_info', agent: { agent: 'claude', agent_status: 'idle', pane_id: 'w1:p2', tab_id: 'w1:t1', workspace_id: 'w1', terminal_id: 'term1', revision: 1, focused: true } } as never);
        prepareStateStore(world);
    });

    after(async () => {
        await world.close();
    });

    const opened = async (cols = 40, env: Readonly<Record<string, string>> = {}): Promise<Pane> => {
        const pane = await world.popup({ cols, rows: 12, env: { TAB_RECAP_PANE: 'w1:p2', ...env } });
        await pane.painted((screen) => screen.plain[0]?.includes('claude') === true, 'the popup names the agent');
        return pane;
    };

    test('it names the agent, says what it asks, and shows an empty note with a cursor and the keys', { timeout: 30_000 }, async () => {
        const pane = await opened();
        try {
            const screen = await pane.painted((each) => each.plain.length > 0, 'the popup is drawn');
            assert.deepEqual(screen.plain.slice(0, 4), ['Compact claude', '', 'Anything it must keep? (optional)', '█']);
            assert.equal(screen.plain.at(-1), '⏎ send · Esc cancel');
        } finally {
            await pane.close();
        }
    });

    test('typed keys build one line: Backspace takes one back, Ctrl-U clears it, an arrow key is not text', { timeout: 30_000 }, async () => {
        const pane = await opened();
        try {
            await typed(pane, ['k', 'e', 'e', 'p', ' ', 'x', 'y']);
            await pane.painted((screen) => screen.plain[3] === 'keep xy█', 'the note reads keep xy');
            await pane.press(DELETE);
            await pane.painted((screen) => screen.plain[3] === 'keep x█', 'Backspace took one back');
            await pane.press(`${ESC}[A`);
            await pane.press('!');
            await pane.painted((screen) => screen.plain[3] === 'keep x!█', 'the arrow key was no text');
            await pane.press(CTRL_U);
            await pane.painted((screen) => screen.plain[3] === '█', 'Ctrl-U cleared the note');
        } finally {
            await pane.close();
        }
    });

    test('pasted lines become one line, and the note stops at 280 characters', { timeout: 30_000 }, async () => {
        const pane = await opened(300);
        try {
            await pane.press('line one\nline two\r\n');
            await pane.painted((screen) => screen.plain[3] === 'line one line two █', 'the paste is one line');
            await pane.press(CTRL_U);
            await pane.press('x'.repeat(LIMIT + 50));
            await pane.painted((screen) => screen.plain[3] === `${'x'.repeat(LIMIT)}█`, 'the note holds 280 characters');
            assert.equal(Array.from(noteLine(pane)).length, LIMIT + 1);
        } finally {
            await pane.close();
        }
    });

    test('the footer fits a narrow popup and still gives a hint', { timeout: 30_000 }, async () => {
        const pane = await opened(12);
        try {
            const footer = pane.screen()?.plain.at(-1) ?? '';
            assert.ok(Array.from(footer).length <= 12, footer);
            assert.notEqual(footer.trim(), '');
        } finally {
            await pane.close();
        }
    });

    test('in Spanish it asks in Spanish', { timeout: 30_000 }, async () => {
        const pane = await world.popup({ cols: 40, rows: 12, env: { TAB_RECAP_PANE: 'w1:p2', TAB_RECAP_LOCALE: 'es' } });
        try {
            const screen = await pane.painted((each) => /Compactar claude/u.test(each.text), 'the title is in Spanish');
            assert.match(screen.text, /¿Algo que deba conservar\?/u);
            assert.ok(Array.from(screen.plain.at(-1) ?? '').length <= 40, screen.plain.at(-1));
        } finally {
            await pane.close();
        }
    });

    test('Enter queues the compaction request for the tab and the pane with the note, and the popup closes', { timeout: 30_000 }, async () => {
        const pane = await opened();
        await typed(pane, ['k', 'e', 'e', 'p', ' ', 'x']);
        await pane.painted((screen) => screen.plain[3] === 'keep x█', 'the note reads keep x');
        await pane.press('\r');
        assert.equal(await pane.exited(), 0);
        assert.deepEqual(requests(world), [['compact', 'w1:t1', 'w1:p2', 'keep x']]);
        await pane.close();
    });

    test('Enter on an empty or blank note queues the request with no note', { timeout: 30_000 }, async () => {
        const empty = await opened();
        await empty.press('\r');
        assert.equal(await empty.exited(), 0);
        const blank = await opened();
        await typed(blank, [' ', ' ']);
        await blank.press('\r');
        assert.equal(await blank.exited(), 0);
        assert.deepEqual(requests(world).slice(1), [['compact', 'w1:t1', 'w1:p2', null], ['compact', 'w1:t1', 'w1:p2', null]]);
        await empty.close();
        await blank.close();
    });

    test('a pasted note is sent as one trimmed line, and a long one is sent cut at 280 characters', { timeout: 30_000 }, async () => {
        const known = requests(world).length;
        const pasted = await opened(300);
        await pasted.press('  line one\n  line two  ');
        await pasted.painted((screen) => screen.plain[3]?.startsWith('line one line two') === true, 'the paste is one line');
        await pasted.press('\r');
        assert.equal(await pasted.exited(), 0);
        const long = await opened(300);
        await long.press('x'.repeat(LIMIT + 50));
        await long.painted((screen) => screen.plain[3] === `${'x'.repeat(LIMIT)}█`, 'the note holds 280 characters');
        await long.press('\r');
        assert.equal(await long.exited(), 0);
        assert.deepEqual(requests(world).slice(known), [['compact', 'w1:t1', 'w1:p2', 'line one line two'], ['compact', 'w1:t1', 'w1:p2', 'x'.repeat(LIMIT)]]);
        await pasted.close();
        await long.close();
    });

    test('Esc and Ctrl-C close the popup and queue nothing', { timeout: 30_000 }, async () => {
        const known = requests(world).length;
        const escaped = await opened();
        await typed(escaped, ['a', 'b']);
        await escaped.painted((screen) => screen.plain[3] === 'ab█', 'the note reads ab');
        await escaped.press(ESC);
        assert.equal(await escaped.exited(), 0);
        const interrupted = await opened();
        await interrupted.press(CTRL_C);
        assert.equal(await interrupted.exited(), 0);
        assert.equal(requests(world).length, known);
        await escaped.close();
        await interrupted.close();
    });
});
