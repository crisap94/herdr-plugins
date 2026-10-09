import { originOf } from '#src/recap/domain/origin.ts';
// The CompactionRecords repository: one row per compaction of a lane; every write is one transaction, every read answers [] when it cannot.
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { ActiveStage, BeginCompaction, BriefOrigin, CompactionEnd, CompactionRecord, CompactionRecords, EndStage, Stage, StageFacts } from '#src/ports/compaction-records.ts';
import { all, BadRow, blob, flag, guarded, maybeText, maybeWhole, one, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { writeTx } from './connection.ts';
import { idOf, typeIdOf } from './typeid.ts';
import { ids } from './uuid7.ts';

const STAGES: ReadonlySet<string> = new Set<Stage>(['briefing', 'compacting', 'restoring', 'compacted', 'failed', 'unconfirmed', 'skipped']);
const ENDED: ReadonlySet<string> = new Set<EndStage>(['compacted', 'failed', 'unconfirmed', 'skipped']);

function stageOf(row: Row): Stage {
    const word = text(row, 'stage');
    if (!STAGES.has(word)) {
        throw new BadRow('stage is not a stage');
    }
    return word as Stage;
}

function briefOf(row: Row): BriefOrigin | null {
    const word = maybeText(row, 'brief');
    return word === 'written' || word === 'template' ? word : null;
}

function recordOf(row: Row): CompactionRecord {
    return {
        id: typeIdOf('compaction', blob(row, 'id')), tab: text(row, 'tab_id'), pane: text(row, 'pane'), agent: text(row, 'agent'),
        stage: stageOf(row), brief: briefOf(row), writer: maybeText(row, 'writer'), templateWhy: maybeText(row, 'template_why'),
        startedAt: whole(row, 'started_at'), stageAt: whole(row, 'stage_at'), finishedAt: maybeWhole(row, 'finished_at'),
        tokensBefore: maybeWhole(row, 'tokens_before'), tokensAfter: maybeWhole(row, 'tokens_after'), tookMs: maybeWhole(row, 'took_ms'),
        retried: flag(row, 'retried'), why: maybeText(row, 'why'), origin: originOf(text(row, 'origin')),
    };
}

/** The newest record of each lane (by start, then by id), unless the agent's next turn has dismissed it. */
const SHOWN = `SELECT * FROM compaction c WHERE tab_id = ? AND dismissed_at IS NULL AND id = (
  SELECT id FROM compaction WHERE tab_id = c.tab_id AND pane = c.pane ORDER BY started_at DESC, id DESC LIMIT 1) ORDER BY started_at, id`;

export class CompactionRecordsRepository implements CompactionRecords {
    private readonly db: DatabaseSync;
    private readonly insert: StatementSync;
    private readonly advanceStage: StatementSync;
    private readonly finishStage: StatementSync;
    private readonly dismiss: StatementSync;
    private readonly interrupt: StatementSync;
    private readonly shown: StatementSync;
    private readonly autoRunning: StatementSync;
    private readonly asks: StatementSync;

    constructor(db: DatabaseSync) {
        this.db = db;
        this.insert = db.prepare('INSERT INTO compaction (id, tab_id, pane, agent, stage, writer, started_at, stage_at, finished_at, why, origin, answer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        this.asks = db.prepare("SELECT pane, answer FROM compaction WHERE origin = 'request' AND answer IS NOT NULL AND finished_at IS NULL");
        this.advanceStage = db.prepare('UPDATE compaction SET stage = ?, stage_at = ?, brief = COALESCE(?, brief), writer = COALESCE(?, writer), template_why = COALESCE(?, template_why) WHERE id = ? AND finished_at IS NULL');
        this.finishStage = db.prepare('UPDATE compaction SET stage = ?, stage_at = ?, finished_at = ?, tokens_before = ?, tokens_after = ?, took_ms = ?, retried = ?, why = ? WHERE id = ? AND finished_at IS NULL');
        this.dismiss = db.prepare('UPDATE compaction SET dismissed_at = ? WHERE tab_id = ? AND pane = ? AND finished_at < ? AND dismissed_at IS NULL');
        this.interrupt = db.prepare("UPDATE compaction SET stage = 'unconfirmed', stage_at = ?, finished_at = ?, why = ? WHERE finished_at IS NULL");
        this.shown = db.prepare(SHOWN);
        this.autoRunning = db.prepare("SELECT 1 AS found FROM compaction WHERE origin = 'auto' AND finished_at IS NULL LIMIT 1");
    }

    begin(start: BeginCompaction): string {
        const id = ids.next();
        const finished = ENDED.has(start.stage) ? start.at : null;
        writeTx(this.db, () => { this.insert.run(id, start.tab, start.pane, start.agent, start.stage, start.writer ?? null, start.at, start.at, finished, start.why ?? null, start.origin ?? 'operator', start.answer ?? null); });
        return typeIdOf('compaction', id);
    }

    advance(id: string, stage: ActiveStage, facts: StageFacts): void {
        const key = idOf('compaction', id);
        if (key !== null) {
            writeTx(this.db, () => { this.advanceStage.run(stage, facts.at, facts.brief ?? null, facts.writer ?? null, facts.templateWhy ?? null, key); });
        }
    }

    finish(id: string, end: CompactionEnd): void {
        const key = idOf('compaction', id);
        if (key !== null) {
            writeTx(this.db, () => { this.finishStage.run(end.stage, end.at, end.at, end.tokensBefore ?? null, end.tokensAfter ?? null, end.tookMs ?? null, end.retried === true ? 1 : 0, end.why ?? null, key); });
        }
    }

    dismissTurn(tab: string, pane: string, at: number): void {
        writeTx(this.db, () => { this.dismiss.run(at, tab, pane, at); });
    }

    unfinishedAsks(): readonly { readonly pane: string; readonly answer: string }[] {
        return guarded(() => all(this.asks).map((row) => ({ pane: text(row, 'pane'), answer: text(row, 'answer') })), []);
    }

    interrupted(at: number, why: string): number {
        return writeTx(this.db, () => Number(this.interrupt.run(at, at, why).changes));
    }

    autoInProgress(): boolean {
        return guarded(() => one(this.autoRunning) !== null, false);
    }

    shownFor(tab: string): readonly CompactionRecord[] {
        return guarded(() => all(this.shown, tab).map(recordOf), []);
    }
}
