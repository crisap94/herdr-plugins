import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import type { Statement } from 'bun:sqlite';
import { stateDirectory } from '#src/daemon/config.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { isClosedWhy, isSection } from '#src/recap/domain/fact.ts';
import { instant } from '#src/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { databaseFile } from '../db/database.ts';
import { BUSY_PRAGMA } from '../db/connection.ts';

export interface StoredPoint {
    readonly id: Text;
    readonly tab: Text;
    readonly pane: Text;
    readonly at: number;
    readonly source: Text;
    readonly cursor: number;
    readonly transcript: Text;
}

export interface FramePoint extends StoredPoint {
    readonly blob: Uint8Array;
}

const FRAME = `SELECT hex(r.id) AS run, r.id AS run_blob, c.tab_id AS tab, t.pane, r.at, t.source, rr.to_cursor AS cursor, hex(t.id) AS transcript
  FROM run r JOIN chapter c ON c.id = r.chapter_id JOIN run_read rr ON rr.run_id = r.id JOIN transcript t ON t.id = rr.transcript_id
  WHERE r.cause = 'turn-ended' AND r.error IS NULL AND t.agent = 'claude' ORDER BY r.at, t.pane`;

const FACTS = `SELECT f.section, f.text, f.why, f.closed_why, f.closed_at, f.first_at, f.last_at,
    CASE WHEN f.closed_at IS NULL OR f.closed_at > ?2 THEN 'open' ELSE 'closed' END AS state
  FROM fact f WHERE f.tab_id = ?1 AND f.born_run <= ?3 ORDER BY f.last_at DESC, f.id LIMIT 300`;

const BREAK = "SELECT max(b.at) AS at FROM boundary b JOIN chapter c ON c.id = b.chapter_id WHERE c.tab_id = ? AND b.kind = 'compacted' AND b.at <= ?";

const EMPTY: Text = must(parseText(''));

function parseWord(value: unknown): Text | null {
    return typeof value === 'string' ? must(parseText(value)) : null;
}

function parseNumber(value: unknown): number | null {
    if (typeof value === 'bigint') return Number(value);
    return typeof value === 'number' ? value : null;
}

const onDisk = (path: Text): Text => {
    let found: string;
    try {
        found = realpathSync(path);
    } catch {
        found = resolve(path);
    }
    return must(parseText(found));
};

export class ExperimentStore {
    private readonly db: Database;
    private readonly facts: Statement;
    private readonly breaks: Statement;

    constructor(path: Text, live: Text = must(parseText(databaseFile(stateDirectory())))) {
        if (onDisk(path) === onDisk(live)) throw new Error(`refusing to open the plugin's live store (${live}): give a copy of it with --db`);
        this.db = new Database(path, { readonly: true });
        this.db.exec(BUSY_PRAGMA);
        this.facts = this.db.prepare(FACTS);
        this.breaks = this.db.prepare(BREAK);
    }

    frame(): readonly FramePoint[] {
        return this.db.prepare(FRAME).all().map((row): FramePoint => ({
            id: must(parseText(`${parseWord(row['run']) ?? ''}:${parseWord(row['pane']) ?? ''}`)), tab: parseWord(row['tab']) ?? EMPTY, pane: parseWord(row['pane']) ?? EMPTY, at: parseNumber(row['at']) ?? 0,
            source: parseWord(row['source']) ?? EMPTY, cursor: parseNumber(row['cursor']) ?? 0, transcript: parseWord(row['transcript']) ?? EMPTY, blob: row['run_blob'] as Uint8Array,
        }));
    }

    factsAt(point: Pick<FramePoint, 'tab' | 'at' | 'blob'>): readonly HistoryFact[] {
        return this.facts.all(point.tab, point.at, point.blob).flatMap((row): readonly HistoryFact[] => {
            const [section, closedWhy, closedAt] = [parseWord(row['section']) ?? EMPTY, parseWord(row['closed_why']), parseNumber(row['closed_at'])];
            if (!isSection(section) || (closedWhy !== null && !isClosedWhy(closedWhy))) return [];
            return [{
                section, text: parseWord(row['text']) ?? EMPTY, why: parseWord(row['why']), state: row['state'] === 'open' ? 'open' : 'closed',
                closedWhy, closedAt: closedAt === null ? null : instant(closedAt), firstAt: instant(parseNumber(row['first_at']) ?? 0), lastAt: instant(parseNumber(row['last_at']) ?? 0),
            }];
        });
    }

    lastBreakAt(tab: Text, at: number): number | null {
        return parseNumber(this.breaks.get(tab, at)?.['at']);
    }

    close(): void {
        this.db.close();
    }
}
