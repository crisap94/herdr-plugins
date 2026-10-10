import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import { stateDir } from '#src/daemon/config.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { databasePath } from './db/database.ts';

export interface StoredPoint {
    readonly id: string;
    readonly tab: string;
    readonly pane: string;
    readonly at: number;
    readonly source: string;
    readonly cursor: number;
    readonly transcript: string;
}

type Param = string | number | Uint8Array;
type Row = Readonly<Record<string, unknown>>;

const FRAME = `SELECT hex(r.id) AS run, r.id AS run_blob, c.tab_id AS tab, t.pane, r.at, t.source, rr.to_cursor AS cursor, hex(t.id) AS transcript
  FROM run r JOIN chapter c ON c.id = r.chapter_id JOIN run_read rr ON rr.run_id = r.id JOIN transcript t ON t.id = rr.transcript_id
  WHERE r.cause = 'turn-ended' AND r.error IS NULL AND t.agent = 'claude' ORDER BY r.at, t.pane`;

const FACTS = `SELECT f.section, f.text, f.why, f.closed_why, f.closed_at, f.first_at, f.last_at,
    CASE WHEN f.closed_at IS NULL OR f.closed_at > ?2 THEN 'open' ELSE 'closed' END AS state
  FROM fact f WHERE f.tab_id = ?1 AND f.born_run <= ?3 ORDER BY f.last_at DESC, f.id LIMIT 300`;

const BREAK = "SELECT max(b.at) AS at FROM boundary b JOIN chapter c ON c.id = b.chapter_id WHERE c.tab_id = ? AND b.kind = 'compacted' AND b.at <= ?";

function num(value: unknown): number | null {
    if (typeof value === 'bigint') return Number(value);
    return typeof value === 'number' ? value : null;
}
const word = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const onDisk = (path: string): string => {
    try {
        return realpathSync(path);
    } catch {
        return resolve(path);
    }
};

export class ExperimentStore {
    private readonly db: DatabaseSync;
    private readonly facts: StatementSync;
    private readonly breaks: StatementSync;

    constructor(path: string, live: string = databasePath(stateDir())) {
        if (onDisk(path) === onDisk(live)) throw new Error(`refusing to open the plugin's live store (${live}): give a copy of it with --db`);
        this.db = new DatabaseSync(path, { readOnly: true });
        this.facts = this.db.prepare(FACTS);
        this.breaks = this.db.prepare(BREAK);
    }

    frame(): readonly (StoredPoint & { readonly blob: Uint8Array })[] {
        return this.db.prepare(FRAME).all().map((row: Row) => ({
            id: `${word(row['run']) ?? ''}:${word(row['pane']) ?? ''}`, tab: word(row['tab']) ?? '', pane: word(row['pane']) ?? '', at: num(row['at']) ?? 0,
            source: word(row['source']) ?? '', cursor: num(row['cursor']) ?? 0, transcript: word(row['transcript']) ?? '', blob: row['run_blob'] as Uint8Array,
        }));
    }

    factsAt(point: { readonly tab: string; readonly at: number; readonly blob: Uint8Array }): readonly HistoryFact[] {
        const params: Param[] = [point.tab, point.at, point.blob];
        return this.facts.all(...params).map((row: Row): HistoryFact => ({
            section: word(row['section']) ?? '', text: word(row['text']) ?? '', why: word(row['why']), state: row['state'] === 'open' ? 'open' : 'closed',
            closedWhy: word(row['closed_why']), closedAt: num(row['closed_at']), firstAt: num(row['first_at']) ?? 0, lastAt: num(row['last_at']) ?? 0,
        }));
    }

    lastBreakAt(tab: string, at: number): number | null {
        return num(this.breaks.get(tab, at)?.['at']);
    }

    close(): void {
        this.db.close();
    }
}
