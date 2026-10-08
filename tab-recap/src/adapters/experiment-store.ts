// Read-only questions an experiment asks a COPY of the plugin's database: the stored turn ends, the facts at their time, the compactions before.
import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import type { HistoryFact } from '#src/ports/ledger.ts';

/** A stored turn end of one Claude lane: where its transcript had been read to when the run happened. */
export interface StoredPoint {
    /** the run's id in hex, then `:` and the lane's pane */
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

const num = (value: unknown): number | null => (typeof value === 'number' ? value : typeof value === 'bigint' ? Number(value) : null);
const word = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export class ExperimentStore {
    private readonly db: DatabaseSync;
    private readonly facts: StatementSync;
    private readonly breaks: StatementSync;

    constructor(path: string) {
        this.db = new DatabaseSync(path, { readOnly: true });
        this.facts = this.db.prepare(FACTS);
        this.breaks = this.db.prepare(BREAK);
    }

    /** Every stored turn end of a Claude lane, oldest first, with the run's blob id for the fact query. */
    frame(): readonly (StoredPoint & { readonly blob: Uint8Array })[] {
        return this.db.prepare(FRAME).all().map((row: Row) => ({
            id: `${word(row['run']) ?? ''}:${word(row['pane']) ?? ''}`, tab: word(row['tab']) ?? '', pane: word(row['pane']) ?? '', at: num(row['at']) ?? 0,
            source: word(row['source']) ?? '', cursor: num(row['cursor']) ?? 0, transcript: word(row['transcript']) ?? '', blob: row['run_blob'] as Uint8Array,
        }));
    }

    /** The tab's facts as they stood when the run happened (born at or before it; open unless closed by then), newest last seen first, at most 300. */
    factsAt(point: { readonly tab: string; readonly at: number; readonly blob: Uint8Array }): readonly HistoryFact[] {
        const params: Param[] = [point.tab, point.at, point.blob];
        return this.facts.all(...params).map((row: Row): HistoryFact => ({
            section: word(row['section']) ?? '', text: word(row['text']) ?? '', why: word(row['why']), state: row['state'] === 'open' ? 'open' : 'closed',
            closedWhy: word(row['closed_why']), closedAt: num(row['closed_at']), firstAt: num(row['first_at']) ?? 0, lastAt: num(row['last_at']) ?? 0,
        }));
    }

    /** When the tab last compacted at or before `at`; null when it never had. */
    lastBreakAt(tab: string, at: number): number | null {
        return num(this.breaks.get(tab, at)?.['at']);
    }

    close(): void {
        this.db.close();
    }
}
