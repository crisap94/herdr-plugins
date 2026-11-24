import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Database } from 'bun:sqlite';
import { TranscriptStore } from '#src/adapters/db/transcripts.ts';
import { MEMORY } from '#src/adapters/db/connection.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import type { SessionCursor } from '@stateforge-labs/session-ledger';
import { normalise } from './parity.ts';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import { sourcePathOf, cursorOf } from '@stateforge-labs/session-ledger';
import { parseTextOrNull } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';

interface Moved {
    readonly id: Uint8Array;
    readonly pane: string;
    readonly from: number;
    readonly to: number;
    readonly replaces: Uint8Array | null;
}

const UPSERT_SQL = `INSERT INTO transcript (id, tab_id, pane, agent, source, attached, position, cursor, tail, title, last_prompt, claude_note, first_seen)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (tab_id, pane, source) DO UPDATE SET agent = excluded.agent, attached = 1, position = excluded.position, cursor = excluded.cursor,
            tail = excluded.tail, title = excluded.title, last_prompt = excluded.last_prompt, claude_note = excluded.claude_note
          RETURNING id`;
const PRIOR_SQL = "SELECT id FROM transcript WHERE tab_id = ? AND pane = ? AND source <> '' ORDER BY first_seen DESC, id DESC LIMIT 1";
const PLACEHOLDER_SQL = "INSERT INTO transcript (id, tab_id, pane, agent, source, attached, cursor, first_seen) VALUES (?, ?, ?, 'unknown', '', 0, 0, ?) RETURNING id";
const DUMP_SQL = 'SELECT tab_id, pane, agent, source, attached, position, cursor, tail, title, last_prompt, claude_note, first_seen FROM transcript ORDER BY tab_id, pane, source';

const idBytes = (n: number): Uint8Array => Uint8Array.from({ length: 16 }, () => n);
const seedTab = (db: Database): void => { db.exec("INSERT INTO tab (id, first_seen, last_seen) VALUES ('tab-1', 100, 500)"); };
const seedRow = (n: number, pane: string, source: string, attached: number, firstSeen: number) => (db: Database): void => {
    db.prepare("INSERT INTO transcript (id, tab_id, pane, agent, source, attached, position, cursor, first_seen) VALUES (?, 'tab-1', ?, 'claude', ?, ?, 0, 4, ?)").run(idBytes(n), pane, source, attached, firstSeen);
};
const seedBoth = (db: Database): void => {
    seedTab(db);
    seedRow(1, 'p9', 'old', 1, 200)(db);
    seedRow(2, 'p1', 's0', 0, 300)(db);
};

const lane = (pane: string, transcript: string, cursor: number, text: string | null = null): SessionCursor => ({ key: paneId(pane), agent: agentKind('claude'), transcript: sourcePathOf(transcript), cursor: cursorOf(cursor), tail: parseTextOrNull(text), title: parseTextOrNull(text), lastPrompt: parseTextOrNull(text), harnessRecap: parseTextOrNull(text) });

const memory = (seed: (db: Database) => void): Database => {
    const opened = openDatabase(fsPathOf(MEMORY));
    if (opened.kind !== 'ready') {
        throw new Error('expected a ready database');
    }
    seed(opened.db);
    return opened.db;
};

const sourceOf = (db: Database, id: Uint8Array): string | null => (db.prepare('SELECT source FROM transcript WHERE id = ?').get(id) as { source: string } | null)?.source ?? null;

function rawAttach(db: Database, tab: string, lanes: readonly SessionCursor[], at: number): Moved[] {
    db.prepare('UPDATE transcript SET attached = 0 WHERE tab_id = ?').run(tab);
    return lanes.map((each, position) => {
        const was = db.prepare('SELECT cursor FROM transcript WHERE tab_id = ? AND pane = ? AND source = ?').get(tab, each.key, each.transcript) as { cursor: number } | null;
        const prior = was === null && each.transcript !== '' ? db.prepare(PRIOR_SQL).get(tab, each.key) as { id: Uint8Array } | null : null;
        const saved = db.prepare(UPSERT_SQL).get(ids.next(), tab, each.key, each.agent, each.transcript, position, each.cursor, each.tail, each.title, each.lastPrompt, each.harnessRecap, at) as { id: Uint8Array };
        return { id: saved.id, pane: each.key, from: was === null ? each.cursor : was.cursor, to: each.cursor, replaces: prior === null ? null : prior.id };
    });
}

const rawOfPane = (db: Database, tab: string, pane: string, at: number): Uint8Array => {
    const found = db.prepare('SELECT id FROM transcript WHERE tab_id = ? AND pane = ? ORDER BY attached DESC, id DESC LIMIT 1').get(tab, pane) as { id: Uint8Array } | null;
    return found?.id ?? (db.prepare(PLACEHOLDER_SQL).get(ids.next(), tab, pane, at) as { id: Uint8Array }).id;
};

const shape = (db: Database, moved: readonly Moved[]): unknown => moved.map((each) => ({ pane: each.pane, from: each.from, to: each.to, source: sourceOf(db, each.id), replaces: each.replaces === null ? null : sourceOf(db, each.replaces) }));

const dumpOf = (db: Database): unknown => db.prepare(DUMP_SQL).all();

function attachSteps(seed: (db: Database) => void, steps: readonly { tab: string; lanes: readonly SessionCursor[]; at: number }[]): void {
    const raw = memory(seed);
    const built = memory(seed);
    try {
        const rows = new TranscriptStore(built);
        for (const step of steps) {
            const oracle = rawAttach(raw, step.tab, step.lanes, step.at);
            const produced = rows.attach(tabId(step.tab), step.lanes, instant(step.at));
            assert.deepStrictEqual(shape(built, produced), shape(raw, oracle));
            for (const each of produced) {
                assert.equal(Object.getPrototypeOf(each.id), Uint8Array.prototype);
            }
        }
        assert.deepStrictEqual(normalise(dumpOf(built)), normalise(dumpOf(raw)));
    } finally {
        raw.close();
        built.close();
    }
}

describe('transcript attach and ofPane move to Drizzle with the same effect', () => {
    test('attach inserts fresh lanes and detaches the rest of the tab', () => {
        attachSteps(seedBoth, [{ tab: 'tab-1', lanes: [lane('p1', 's1', 5, 'tail'), lane('p2', 's2', 7)], at: 600 }]);
    });

    test('attach upserts a known lane and keeps its id and its first cursor', () => {
        attachSteps(seedBoth, [
            { tab: 'tab-1', lanes: [lane('p1', 's0', 9, 'again')], at: 600 },
            { tab: 'tab-1', lanes: [lane('p1', 's0', 12)], at: 700 },
        ]);
    });

    test('attach names the row it replaces when a new source starts on a pane', () => {
        attachSteps(seedBoth, [{ tab: 'tab-1', lanes: [lane('p1', 's1', 2)], at: 600 }]);
    });

    test('attach with an empty source skips the prior lookup', () => {
        attachSteps(seedBoth, [{ tab: 'tab-1', lanes: [lane('p1', '', 0)], at: 600 }]);
    });

    test('ofPane returns the attached row, or makes a placeholder when there is none', () => {
        for (const pane of ['p1', 'p3']) {
            const raw = memory(seedBoth);
            const built = memory(seedBoth);
            try {
                const oracle = rawOfPane(raw, 'tab-1', pane, 800);
                const produced = new TranscriptStore(built).ofPane(tabId('tab-1'), paneId(pane), instant(800));
                assert.equal(Object.getPrototypeOf(produced), Uint8Array.prototype);
                assert.equal(sourceOf(built, produced), sourceOf(raw, oracle));
                assert.deepStrictEqual(normalise(dumpOf(built)), normalise(dumpOf(raw)));
            } finally {
                raw.close();
                built.close();
            }
        }
    });
});
