import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import type { Statement } from 'bun:sqlite';
import { stateDir } from '#src/daemon/config.ts';
import type { HistoryFact } from '#src/ports/ledger.ts';
import { must, type Result } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseMilliseconds, type Milliseconds } from '#src/recap/domain/time.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { databasePath } from '../db/database.ts';
import { BUSY_PRAGMA } from '../db/connection.ts';
import { parseRow } from '../transcripts/jsonl.ts';

export interface StoredPoint {
    readonly id: Text;
    readonly tab: Text;
    readonly pane: Text;
    readonly at: Milliseconds;
    readonly source: FsPath;
    readonly cursor: Count;
    readonly transcript: Text;
}

export type FramePoint = StoredPoint & { readonly blob: Uint8Array };

export interface FactRecord {
    readonly section: Text;
    readonly text: Text;
    readonly why: Text | null;
    readonly state: 'open' | 'closed';
    readonly closedWhy: Text | null;
    readonly closedAt: Milliseconds | null;
    readonly firstAt: Milliseconds;
    readonly lastAt: Milliseconds;
}

export type LastBreak = Milliseconds | null;

const FRAME = `SELECT hex(r.id) AS run, r.id AS run_blob, c.tab_id AS tab, t.pane, r.at, t.source, rr.to_cursor AS cursor, hex(t.id) AS transcript
  FROM run r JOIN chapter c ON c.id = r.chapter_id JOIN run_read rr ON rr.run_id = r.id JOIN transcript t ON t.id = rr.transcript_id
  WHERE r.cause = 'turn-ended' AND r.error IS NULL AND t.agent = 'claude' ORDER BY r.at, t.pane`;

const FACTS = `SELECT f.section, f.text, f.why, f.closed_why, f.closed_at, f.first_at, f.last_at,
    CASE WHEN f.closed_at IS NULL OR f.closed_at > ?2 THEN 'open' ELSE 'closed' END AS state
  FROM fact f WHERE f.tab_id = ?1 AND f.born_run <= ?3 ORDER BY f.last_at DESC, f.id LIMIT 300`;

const BREAK = "SELECT max(b.at) AS at FROM boundary b JOIN chapter c ON c.id = b.chapter_id WHERE c.tab_id = ? AND b.kind = 'compacted' AND b.at <= ?";

function valueOf<T>(result: Result<T, ParseFailure>): T | null {
    return result.kind === 'ok' ? result.value : null;
}

function recordOrThrow<T>(value: T | null): T {
    if (value === null) throw new Error('a row does not match the store schema');
    return value;
}

export function parseFramePoint(input: unknown): FramePoint | null {
    const row = parseRow(input);
    if (row.kind !== 'ok') return null;
    const { run, run_blob: blob, tab, pane, at, source, cursor, transcript } = row.value;
    const paneText = valueOf(parseText(pane));
    const id = valueOf(parseText(`${String(run)}:${String(pane)}`));
    const tabText = valueOf(parseText(tab));
    const transcriptText = valueOf(parseText(transcript));
    const instant = valueOf(parseMilliseconds(at));
    const path = valueOf(parseFsPath(source));
    const cursorCount = valueOf(parseCount(cursor));
    if (id === null || paneText === null || tabText === null || transcriptText === null || instant === null || path === null || cursorCount === null || !(blob instanceof Uint8Array)) return null;
    return { id, tab: tabText, pane: paneText, at: instant, source: path, cursor: cursorCount, transcript: transcriptText, blob };
}

export function parseFactRecord(input: unknown): FactRecord | null {
    const row = parseRow(input);
    if (row.kind !== 'ok') return null;
    const { section, text, why, closed_why: closedWhy, closed_at: closedAt, first_at: firstAt, last_at: lastAt, state } = row.value;
    const sectionText = valueOf(parseText(section));
    const bodyText = valueOf(parseText(text));
    const firstInstant = valueOf(parseMilliseconds(firstAt));
    const lastInstant = valueOf(parseMilliseconds(lastAt));
    if (sectionText === null || bodyText === null || firstInstant === null || lastInstant === null) return null;
    return {
        section: sectionText, text: bodyText, why: why === null ? null : valueOf(parseText(why)), state: state === 'open' ? 'open' : 'closed',
        closedWhy: closedWhy === null ? null : valueOf(parseText(closedWhy)), closedAt: closedAt === null ? null : valueOf(parseMilliseconds(closedAt)),
        firstAt: firstInstant, lastAt: lastInstant,
    };
}

export function parseLastBreak(input: unknown): LastBreak {
    const row = parseRow(input);
    if (row.kind !== 'ok') return null;
    return valueOf(parseMilliseconds(row.value['at']));
}

const onDisk = (path: FsPath): FsPath => {
    try {
        return must(parseFsPath(realpathSync(path)));
    } catch {
        return must(parseFsPath(resolve(path)));
    }
};

export class ExperimentStoreAt {
    private readonly db: Database;
    private readonly facts: Statement;
    private readonly breaks: Statement;

    constructor(path: FsPath, live: FsPath = recordOrThrow(valueOf(parseFsPath(databasePath(stateDir()))))) {
        if (onDisk(path) === onDisk(live)) throw new Error(`refusing to open the plugin's live store (${live}): give a copy of it with --db`);
        this.db = new Database(path, { readonly: true });
        this.db.exec(BUSY_PRAGMA);
        this.facts = this.db.prepare(FACTS);
        this.breaks = this.db.prepare(BREAK);
    }

    frame(): readonly FramePoint[] {
        return this.db.prepare(FRAME).all().map((row) => recordOrThrow(parseFramePoint(row)));
    }

    factsAt(point: FramePoint): readonly HistoryFact[] {
        return this.facts.all(point.tab, point.at, point.blob).map((row): HistoryFact => {
            const fact = recordOrThrow(parseFactRecord(row));
            return { section: fact.section, text: fact.text, why: fact.why, state: fact.state, closedWhy: fact.closedWhy, closedAt: fact.closedAt, firstAt: fact.firstAt, lastAt: fact.lastAt };
        });
    }

    lastBreakAt(tab: Text, at: Milliseconds): LastBreak {
        return parseLastBreak(this.breaks.get(tab, at));
    }

    close(): void {
        this.db.close();
    }
}

export { ExperimentStore } from './legacy.ts';
