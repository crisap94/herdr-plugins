import type { Database } from 'bun:sqlite';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { must } from '#src/protocol/result.ts';
import { type RunId, parseRunId } from '#src/recap/domain/run-ids.ts';
import { type Text, parseText } from '#src/recap/domain/text.ts';
import { parseDisagreementRecord, parsePairRecord, parseVerdictRecord, type DisagreementRecord, type PairRecord, type VerdictRecord, type VerdictStore, type Disagreement, type Pair, type Verdict, type Verdicts } from '#src/ports/verdicts.ts';
import { writeTx } from './connection.ts';
import { verdict as verdicts } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { blob, guarded, type Row } from './rows.ts';
import { idOf, typeIdOf } from './typeid.ts';
import { ids } from './uuid7.ts';

const LATEST = sql`WITH latest AS (
    SELECT v.* FROM verdict v WHERE v.at = (SELECT MAX(x.at) FROM verdict x WHERE x.run_id = v.run_id AND x.item_key IS v.item_key AND x.check_id = v.check_id AND x.source = v.source)
  )`;

const PAIRS = sql`${LATEST} SELECT j.check_id, j.pass AS judge_pass, o.pass AS operator_pass FROM latest j
  JOIN latest o ON o.run_id = j.run_id AND o.item_key IS j.item_key AND o.check_id = j.check_id AND o.source = 'operator'
  WHERE j.source = 'judge'`;

const DISAGREE = sql`${LATEST}
  SELECT j.run_id, j.item_key, j.check_id, j.pass AS judge_pass, o.pass AS operator_pass, j.critique AS judge_critique, o.critique AS reason, o.at AS at FROM latest j
  JOIN latest o ON o.run_id = j.run_id AND o.item_key IS j.item_key AND o.check_id = j.check_id AND o.source = 'operator'
  WHERE j.source = 'judge' AND j.item_key IS NOT NULL AND j.pass <> o.pass ORDER BY o.at DESC, o.id DESC`;

export class VerdictRowStore implements VerdictStore {
    private readonly db: Database;
    private readonly orm: Orm;

    constructor(db: Database) {
        this.db = db;
        this.orm = ormOf(db);
    }

    add(rows: readonly VerdictRecord[]): void {
        writeTx(this.db, () => {
            for (const verdict of rows) {
                const run = idOf('run', verdict.run);
                if (run === null) {
                    throw new Error(`not a run id: ${verdict.run}`);
                }
                this.orm.insert(verdicts).values({
                    id: ids.next(), runId: run, itemKey: verdict.item, checkId: verdict.check, pass: verdict.pass === 'pass' ? 1 : 0,
                    critique: verdict.critique, judge: verdict.judge, at: verdict.at, source: verdict.source,
                }).run();
            }
        });
    }

    ofRun(run: RunId): readonly VerdictRecord[] {
        const id = idOf('run', run);
        return id === null ? [] : guarded(() => this.orm.select({
            item: verdicts.itemKey, check: verdicts.checkId, pass: verdicts.pass, critique: verdicts.critique,
            judge: verdicts.judge, at: verdicts.at, source: verdicts.source,
        }).from(verdicts).where(eq(verdicts.runId, id)).orderBy(asc(verdicts.at), asc(verdicts.checkId)).all()
            .map((row) => must(parseVerdictRecord({ ...row, run, pass: (row.pass === 1 ? 'pass' : 'fail') }))), []);
    }

    labelled(check: Text | null = null): ReadonlySet<Text> {
        return guarded(() => new Set(this.orm.selectDistinct({ runId: verdicts.runId, itemKey: verdicts.itemKey }).from(verdicts)
            .where(and(eq(verdicts.source, 'operator'), isNotNull(verdicts.itemKey), check === null ? undefined : eq(verdicts.checkId, check))).all()
            .map((row) => must(parseText(`${typeIdOf('run', row.runId)}|${row.itemKey}`)))), new Set<Text>());
    }

    pairs(): readonly PairRecord[] {
        return guarded(() => this.orm.all<Row>(PAIRS).map((row) => must(parsePairRecord({
            check: row.check_id, judge: (row.judge_pass === 1 ? 'pass' : 'fail'), operator: (row.operator_pass === 1 ? 'pass' : 'fail'),
        }))), []);
    }

    disagreements(): readonly DisagreementRecord[] {
        return guarded(() => this.orm.all<Row>(DISAGREE).map((row) => must(parseDisagreementRecord({
            run: typeIdOf('run', blob(row, 'run_id')), item: row.item_key, check: row.check_id, judge: (row.judge_pass === 1 ? 'pass' : 'fail'), operator: (row.operator_pass === 1 ? 'pass' : 'fail'),
            judgeCritique: row.judge_critique, reason: row.reason, at: row.at,
        }))), []);
    }
}

const verdictOf = (record: VerdictRecord): Verdict => ({
    run: record.run, item: record.item, check: record.check, pass: record.pass === 'pass', critique: record.critique,
    judge: record.judge, at: record.at, source: record.source,
});

const disagreementOf = (record: DisagreementRecord): Disagreement => ({
    run: record.run, item: record.item, check: record.check, judge: record.judge === 'pass', operator: record.operator === 'pass',
    judgeCritique: record.judgeCritique, reason: record.reason, at: record.at,
});

export class VerdictsRepository implements Verdicts {
    private readonly store: VerdictRowStore;

    constructor(db: Database) {
        this.store = new VerdictRowStore(db);
    }

    add(rows: readonly Verdict[]): void {
        this.store.add(rows.map((verdict) => {
            if (parseRunId(verdict.run).kind === 'err') {
                throw new Error(`not a run id: ${verdict.run}`);
            }
            return must(parseVerdictRecord({ ...verdict, pass: verdict.pass ? 'pass' : 'fail' }));
        }));
    }

    ofRun(run: string): readonly Verdict[] {
        const id = parseRunId(run);
        return id.kind === 'ok' ? this.store.ofRun(id.value).map(verdictOf) : [];
    }

    labelled(check: string | null = null): ReadonlySet<string> {
        if (check === null) {
            return this.store.labelled(null);
        }
        const text = parseText(check);
        return text.kind === 'ok' ? this.store.labelled(text.value) : new Set<string>();
    }

    pairs(): readonly Pair[] {
        return this.store.pairs().map((pair) => ({ check: pair.check, judge: pair.judge === 'pass', operator: pair.operator === 'pass' }));
    }

    disagreements(): readonly Disagreement[] {
        return this.store.disagreements().map(disagreementOf);
    }
}
