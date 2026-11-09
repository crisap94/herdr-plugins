import type { Database, Statement } from 'bun:sqlite';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { Disagreement, Pair, Verdict, VerdictSource, Verdicts } from '#src/ports/verdicts.ts';
import { writeTx } from './connection.ts';
import { verdict as verdicts } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { all, blob, flag, guarded, maybeText, text, whole } from './rows.ts';
import { idOf, typeIdOf } from './typeid.ts';
import { ids } from './uuid7.ts';

const PAIRS = `WITH latest AS (
    SELECT v.* FROM verdict v WHERE v.at = (SELECT MAX(x.at) FROM verdict x WHERE x.run_id = v.run_id AND x.item_key IS v.item_key AND x.check_id = v.check_id AND x.source = v.source)
  )
  SELECT j.check_id, j.pass AS judge_pass, o.pass AS operator_pass FROM latest j
  JOIN latest o ON o.run_id = j.run_id AND o.item_key IS j.item_key AND o.check_id = j.check_id AND o.source = 'operator'
  WHERE j.source = 'judge'`;

const LATEST = `WITH latest AS (
    SELECT v.* FROM verdict v WHERE v.at = (SELECT MAX(x.at) FROM verdict x WHERE x.run_id = v.run_id AND x.item_key IS v.item_key AND x.check_id = v.check_id AND x.source = v.source)
  )`;

const DISAGREE = `${LATEST}
  SELECT j.run_id, j.item_key, j.check_id, j.pass AS judge_pass, o.pass AS operator_pass, j.critique AS judge_critique, o.critique AS reason, o.at AS at FROM latest j
  JOIN latest o ON o.run_id = j.run_id AND o.item_key IS j.item_key AND o.check_id = j.check_id AND o.source = 'operator'
  WHERE j.source = 'judge' AND j.item_key IS NOT NULL AND j.pass <> o.pass ORDER BY o.at DESC, o.id DESC`;

export class VerdictsRepository implements Verdicts {
    private readonly db: Database;
    private readonly orm: Orm;
    private readonly pairSelect: Statement;
    private readonly disagreeSelect: Statement;

    constructor(db: Database) {
        this.db = db;
        this.orm = ormOf(db);
        this.disagreeSelect = db.prepare(DISAGREE);
        this.pairSelect = db.prepare(PAIRS);
    }

    add(rows: readonly Verdict[]): void {
        writeTx(this.db, () => {
            for (const verdict of rows) {
                const run = idOf('run', verdict.run);
                if (run === null) {
                    throw new Error(`not a run id: ${verdict.run}`);
                }
                this.orm.insert(verdicts).values({
                    id: ids.next(), runId: run, itemKey: verdict.item, checkId: verdict.check, pass: verdict.pass ? 1 : 0,
                    critique: verdict.critique, judge: verdict.judge, at: verdict.at, source: verdict.source,
                }).run();
            }
        });
    }

    ofRun(run: string): readonly Verdict[] {
        const id = idOf('run', run);
        return id === null ? [] : guarded(() => this.orm.select({
            item: verdicts.itemKey, check: verdicts.checkId, pass: verdicts.pass, critique: verdicts.critique,
            judge: verdicts.judge, at: verdicts.at, source: verdicts.source,
        }).from(verdicts).where(eq(verdicts.runId, id)).orderBy(asc(verdicts.at), asc(verdicts.checkId)).all()
            .map((row): Verdict => ({
                run, item: row.item, check: row.check, pass: row.pass === 1, critique: row.critique,
                judge: row.judge, at: row.at, source: row.source === 'operator' ? 'operator' : ('judge' satisfies VerdictSource),
            })), []);
    }

    labelled(check: string | null = null): ReadonlySet<string> {
        return guarded(() => new Set(this.orm.selectDistinct({ runId: verdicts.runId, itemKey: verdicts.itemKey }).from(verdicts)
            .where(and(eq(verdicts.source, 'operator'), isNotNull(verdicts.itemKey), check === null ? undefined : eq(verdicts.checkId, check))).all()
            .map((row) => `${typeIdOf('run', row.runId)}|${row.itemKey}`)), new Set());
    }

    pairs(): readonly Pair[] {
        return guarded(() => all(this.pairSelect).map((row) => ({ check: text(row, 'check_id'), judge: flag(row, 'judge_pass'), operator: flag(row, 'operator_pass') })), []);
    }

    disagreements(): readonly Disagreement[] {
        return guarded(() => all(this.disagreeSelect).map((row): Disagreement => ({
            run: typeIdOf('run', blob(row, 'run_id')), item: text(row, 'item_key'), check: text(row, 'check_id'), judge: flag(row, 'judge_pass'), operator: flag(row, 'operator_pass'),
            judgeCritique: maybeText(row, 'judge_critique'), reason: maybeText(row, 'reason'), at: whole(row, 'at'),
        })), []);
    }
}
