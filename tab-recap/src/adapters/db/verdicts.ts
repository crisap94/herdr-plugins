// The Verdicts repository: what the judge and the operator said about a run's items, one row per check.
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { Disagreement, Pair, Verdict, VerdictSource, Verdicts } from '#src/ports/verdicts.ts';
import { writeTx } from './connection.ts';
import { all, blob, flag, guarded, maybeText, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { idOf, typeIdOf } from './typeid.ts';
import { ids } from './uuid7.ts';

/** Newest verdict of each source per (run, item, check), then the pairs that have both. `IS` compares NULL items too. */
const PAIRS = `WITH latest AS (
    SELECT v.* FROM verdict v WHERE v.at = (SELECT MAX(x.at) FROM verdict x WHERE x.run_id = v.run_id AND x.item_key IS v.item_key AND x.check_id = v.check_id AND x.source = v.source)
  )
  SELECT j.check_id, j.pass AS judge_pass, o.pass AS operator_pass FROM latest j
  JOIN latest o ON o.run_id = j.run_id AND o.item_key IS j.item_key AND o.check_id = j.check_id AND o.source = 'operator'
  WHERE j.source = 'judge'`;

const LATEST = `WITH latest AS (
    SELECT v.* FROM verdict v WHERE v.at = (SELECT MAX(x.at) FROM verdict x WHERE x.run_id = v.run_id AND x.item_key IS v.item_key AND x.check_id = v.check_id AND x.source = v.source)
  )`;

/** The items where the newest judge verdict and the newest operator verdict of a check differ, the operator's newest ruling first. */
const DISAGREE = `${LATEST}
  SELECT j.run_id, j.item_key, j.check_id, j.pass AS judge_pass, o.pass AS operator_pass, j.critique AS judge_critique, o.critique AS reason, o.at AS at FROM latest j
  JOIN latest o ON o.run_id = j.run_id AND o.item_key IS j.item_key AND o.check_id = j.check_id AND o.source = 'operator'
  WHERE j.source = 'judge' AND j.item_key IS NOT NULL AND j.pass <> o.pass ORDER BY o.at DESC, o.id DESC`;

export class VerdictsRepository implements Verdicts {
    private readonly db: DatabaseSync;
    private readonly insert: StatementSync;
    private readonly byRun: StatementSync;
    private readonly operator: StatementSync;
    private readonly pairSelect: StatementSync;
    private readonly disagreeSelect: StatementSync;

    constructor(db: DatabaseSync) {
        this.db = db;
        this.insert = db.prepare('INSERT INTO verdict (id, run_id, item_key, check_id, pass, critique, judge, at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        this.byRun = db.prepare('SELECT * FROM verdict WHERE run_id = ? ORDER BY at, check_id');
        this.operator = db.prepare("SELECT DISTINCT run_id, item_key FROM verdict WHERE source = 'operator' AND item_key IS NOT NULL AND (?1 IS NULL OR check_id = ?1)");
        this.disagreeSelect = db.prepare(DISAGREE);
        this.pairSelect = db.prepare(PAIRS);
    }

    add(verdicts: readonly Verdict[]): void {
        writeTx(this.db, () => {
            for (const verdict of verdicts) {
                const run = idOf('run', verdict.run);
                if (run === null) {
                    throw new Error(`not a run id: ${verdict.run}`);
                }
                this.insert.run(ids.next(), run, verdict.item, verdict.check, verdict.pass ? 1 : 0, verdict.critique, verdict.judge, verdict.at, verdict.source);
            }
        });
    }

    ofRun(run: string): readonly Verdict[] {
        const id = idOf('run', run);
        const verdict = (row: Row): Verdict => ({
            run, item: maybeText(row, 'item_key'), check: text(row, 'check_id'), pass: flag(row, 'pass'), critique: maybeText(row, 'critique'),
            judge: text(row, 'judge'), at: whole(row, 'at'), source: text(row, 'source') === 'operator' ? 'operator' : ('judge' satisfies VerdictSource),
        });
        return id === null ? [] : guarded(() => all(this.byRun, id).map(verdict), []);
    }

    labelled(check: string | null = null): ReadonlySet<string> {
        return guarded(() => new Set(all(this.operator, check).map((row) => `${typeIdOf('run', blob(row, 'run_id'))}|${text(row, 'item_key')}`)), new Set());
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
