import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { Row } from './rows.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import { blob, one, whole } from './rows.ts';
import { ids } from './uuid7.ts';

export interface Moved {
    readonly id: Uint8Array;
    readonly pane: string;
    readonly from: number;
    readonly to: number;
    readonly replaces: Uint8Array | null;
}

export class TranscriptRows {
    private readonly detach: StatementSync;
    private readonly was: StatementSync;
    private readonly priorStatement: StatementSync;
    private readonly upsert: StatementSync;
    private readonly ofPaneStatement: StatementSync;
    private readonly placeholder: StatementSync;

    constructor(db: DatabaseSync) {
        this.detach = db.prepare('UPDATE transcript SET attached = 0 WHERE tab_id = ?');
        this.was = db.prepare('SELECT cursor FROM transcript WHERE tab_id = ? AND pane = ? AND source = ?');
        this.priorStatement = db.prepare("SELECT id FROM transcript WHERE tab_id = ? AND pane = ? AND source <> '' ORDER BY first_seen DESC, id DESC LIMIT 1");
        this.upsert = db.prepare(`INSERT INTO transcript (id, tab_id, pane, agent, source, attached, position, cursor, tail, title, last_prompt, claude_note, first_seen)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (tab_id, pane, source) DO UPDATE SET agent = excluded.agent, attached = 1, position = excluded.position, cursor = excluded.cursor,
            tail = excluded.tail, title = excluded.title, last_prompt = excluded.last_prompt, claude_note = excluded.claude_note
          RETURNING id`);
        this.ofPaneStatement = db.prepare('SELECT id FROM transcript WHERE tab_id = ? AND pane = ? ORDER BY attached DESC, id DESC LIMIT 1');
        this.placeholder = db.prepare("INSERT INTO transcript (id, tab_id, pane, agent, source, attached, cursor, first_seen) VALUES (?, ?, ?, 'unknown', '', 0, 0, ?) RETURNING id");
    }

    attach(tab: string, lanes: readonly LaneCursor[], at: number): readonly Moved[] {
        this.detach.run(tab);
        return lanes.map((lane, position) => {
            const was = one(this.was, tab, lane.pane, lane.transcript);
            const prior = was === null && lane.transcript !== '' ? one(this.priorStatement, tab, lane.pane) : null;
            const saved = this.upsert.get(ids.next(), tab, lane.pane, lane.agent, lane.transcript, position, lane.cursor, lane.tail, lane.title, lane.lastPrompt, lane.claudeRecap, at) as Row;
            return { id: blob(saved, 'id'), pane: lane.pane, from: was === null ? lane.cursor : whole(was, 'cursor'), to: lane.cursor, replaces: prior === null ? null : blob(prior, 'id') };
        });
    }

    ofPane(tab: string, pane: string, at: number): Uint8Array {
        const found = one(this.ofPaneStatement, tab, pane);
        return blob(found ?? (this.placeholder.get(ids.next(), tab, pane, at) as Row), 'id');
    }
}
