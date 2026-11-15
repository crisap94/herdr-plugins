// Part B of the judge-agreement eval: does the suite's Sonnet judge agree with the planted labels?
//
// Usage:
//   bun evals/judge-agreement/run-b.ts --label <name> [--stub] [--dataset <file>]
//       [--max-calls <n>] [--repeat <n>] [--seed <n>] [--concurrency <n>]
//
// Each dataset row is one answer from a sibling eval, with a planted label per judge criterion:
// 'fail' (must-fail cell), 'pass' (must-pass cell) or 'open' (not scored). Rows whose answer does
// not parse are not sent to the judge. Outputs go to
// $HOME/.local/state/tab-recap-evals/suite/judge-agreement/runs/<label>-b/.

import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claude } from '../lib/claude.ts';
import { BACKOFF_MS, MAX_CONCURRENCY } from '../lib/cli.ts';
import { STATE_ROOT } from '../lib/env.ts';
import { JUDGE, judgeOne } from '../lib/judge.ts';
import { appendJsonl, keyOf, lastByKey, pool, readJsonl, rng, runDir, sha256, shuffled, type Pause } from '../lib/runner.ts';
import { cohenKappa, flips, percent, wilson } from '../lib/stats.ts';
import { stubJudge } from '../lib/stub.ts';
import type { Adapter, Interval, Judged, JudgeView, Mark } from '../lib/types.ts';
import { criteriaIds, loadSiblings, type Expect, type Row, type Sibling } from './b-evals.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVALS = resolve(HERE, '..');
const DEFAULT_DATASET = join(HERE, 'dataset-b.jsonl');

// SPEC section 3 gate.
const MIN_CELLS = 20;
const MIN_KAPPA = 0.6;
const MIN_RATE_LOW = 0.7;
// Repeated judgments are drawn from this many parsed rows per extra repetition.
const REPEAT_SAMPLE = 50;
// Stop picking new judge calls after this many failed calls in a row.
const STOP_AFTER = 5;

interface Args {
    readonly stub: boolean;
    readonly dataset: string;
    readonly label: string;
    readonly maxCalls: number;
    readonly repeat: number;
    readonly seed: number;
    readonly concurrency: number;
}

interface Parsed {
    readonly row: Row;
    readonly sibling: Sibling;
    readonly view: JudgeView;
}

interface Task extends Parsed {
    readonly repetition: number;
    readonly key: string;
}

interface Cell {
    readonly row: Row;
    readonly criterion: string;
    readonly expected: Expect;
    readonly passed: Mark;
    readonly evidence: string;
}

interface Gate {
    readonly id: string;
    readonly eval: string;
    readonly mustFail: number;
    readonly detected: Interval;
    readonly mustPass: number;
    readonly accepted: Interval;
    readonly missing: number;
    readonly kappa: number | null;
    readonly agrees: boolean;
    readonly reasons: readonly string[];
}

function parseArgs(argv: readonly string[]): Args {
    const values: { stub: boolean; dataset: string; label: string; maxCalls: number; repeat: number; seed: number; concurrency: number } = {
        stub: false,
        dataset: DEFAULT_DATASET,
        label: '',
        maxCalls: Number.POSITIVE_INFINITY,
        repeat: 0,
        seed: 1,
        concurrency: 1,
    };
    const whole = (flag: string, value: string): number => {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0) throw new Error(`${flag} needs a whole number, got ${JSON.stringify(value)}`);
        return n;
    };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index] ?? '';
        const next = (): string => {
            const value = argv[index + 1];
            if (value === undefined) throw new Error(`${flag} needs a value`);
            index += 1;
            return value;
        };
        switch (flag) {
            case '--stub':
                values.stub = true;
                break;
            case '--dataset':
                values.dataset = resolve(next());
                break;
            case '--label':
                values.label = next();
                break;
            case '--max-calls':
                values.maxCalls = whole(flag, next());
                break;
            case '--repeat':
                values.repeat = whole(flag, next());
                break;
            case '--seed':
                values.seed = whole(flag, next());
                break;
            case '--concurrency':
                values.concurrency = whole(flag, next());
                break;
            default:
                throw new Error(`unknown option ${JSON.stringify(flag)}`);
        }
    }
    if (values.label === '') throw new Error('--label is required');
    return { ...values, concurrency: Math.min(Math.max(values.concurrency, 1), MAX_CONCURRENCY) };
}

function loadRows(file: string): Row[] {
    if (!existsSync(file)) throw new Error(`dataset not found: ${file}`);
    const rows = readJsonl<Row>(file);
    if (rows.length === 0) throw new Error(`dataset has no rows: ${file}`);
    return rows;
}

function gateFor(id: string, eval_: string, cells: readonly Cell[]): Gate {
    const scored = cells.filter((cell) => cell.expected !== 'open' && cell.passed !== null);
    const mustFail = scored.filter((cell) => cell.expected === 'fail');
    const mustPass = scored.filter((cell) => cell.expected === 'pass');
    const detected = wilson(mustFail.filter((cell) => cell.passed === false).length, mustFail.length);
    const accepted = wilson(mustPass.filter((cell) => cell.passed === true).length, mustPass.length);
    const kappa = cohenKappa(scored.map((cell) => [cell.expected === 'pass', cell.passed === true] as const));
    const missing = cells.filter((cell) => cell.expected !== 'open' && cell.passed === null).length;
    const reasons: string[] = [];
    if (mustFail.length < MIN_CELLS) reasons.push(`${mustFail.length} must-fail cells with a verdict, need ${MIN_CELLS}`);
    if (mustPass.length < MIN_CELLS) reasons.push(`${mustPass.length} must-pass cells with a verdict, need ${MIN_CELLS}`);
    if (kappa === null || kappa < MIN_KAPPA) reasons.push(`kappa ${kappa === null ? 'undefined' : kappa.toFixed(2)}, need at least ${MIN_KAPPA}`);
    if (detected.low < MIN_RATE_LOW) reasons.push(`must-fail Wilson lower bound ${percent(detected.low)}, need ${percent(MIN_RATE_LOW)}`);
    if (accepted.low < MIN_RATE_LOW) reasons.push(`must-pass Wilson lower bound ${percent(accepted.low)}, need ${percent(MIN_RATE_LOW)}`);
    return { id, eval: eval_, mustFail: mustFail.length, detected, mustPass: mustPass.length, accepted, missing, kappa, agrees: reasons.length === 0, reasons };
}

function csvCell(value: string | number | null): string {
    if (value === null) return '';
    return `"${String(value).replace(/"/g, '""')}"`;
}

function percentOrNa(interval: Interval): string {
    return interval.n === 0 ? 'n/a' : `${interval.k}/${interval.n} (${percent(interval.low)}–${percent(interval.high)})`;
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const siblings = loadSiblings(EVALS);
    const rows = loadRows(args.dataset);
    const dir = runDir(STATE_ROOT, 'judge-agreement', `${args.label}-b`);
    const verdictsPath = join(dir, 'verdicts.jsonl');
    const config = args.stub ? 'stub' : JUDGE.model;
    const log = (line: string): void => {
        appendFileSync(join(dir, 'run.log'), `${new Date().toISOString()} ${line}\n`);
        console.log(line);
    };

    const parsed: Parsed[] = [];
    const unparsed: Row[] = [];
    for (const row of rows) {
        const sibling = siblings.get(row.eval);
        if (sibling === undefined) throw new Error(`row ${row.id}: unknown eval ${row.eval}`);
        const item = sibling.items.get(row.source);
        if (item === undefined) throw new Error(`row ${row.id}: no ${row.eval} item ${row.source}`);
        const judgeable = sibling.judge(item, row.answer);
        if (!judgeable.ok) {
            unparsed.push(row);
            continue;
        }
        parsed.push({ row, sibling, view: judgeable.view });
    }

    // Repetition 0 covers every parsed row. Each extra repetition re-judges a seeded sample.
    const random = rng(args.seed);
    const plan: Task[] = parsed.map((entry) => ({ ...entry, repetition: 0, key: keyOf(entry.row.id, config, 0) }));
    for (let repetition = 1; repetition <= args.repeat; repetition += 1) {
        for (const entry of shuffled(parsed, random).slice(0, REPEAT_SAMPLE)) {
            plan.push({ ...entry, repetition, key: keyOf(entry.row.id, config, repetition) });
        }
    }

    const done = lastByKey(readJsonl<Judged>(verdictsPath));
    const todo = plan.filter((task) => {
        const prior = done.get(task.key);
        return prior === undefined || prior.failure_kind !== null;
    });
    log(`rows ${rows.length}: parsed ${parsed.length}, unparsed ${unparsed.length}; judging ${todo.length} of ${plan.length} planned, ${plan.length - todo.length} already on record`);

    const adapters = new Map<string, Adapter>();
    const adapterFor = (sibling: Sibling): Adapter => {
        if (!args.stub) return claude;
        let adapter = adapters.get(sibling.eval);
        if (adapter === undefined) {
            adapter = stubJudge(sibling.criteria.map((criterion) => criterion.id));
            adapters.set(sibling.eval, adapter);
        }
        return adapter;
    };

    const pause: Pause = { until: 0 };
    let made = 0;
    let consecutive = 0;
    let stopped = false;
    let capped = false;
    await pool(todo, args.concurrency, async (task) => {
        if (stopped) return;
        if (made >= args.maxCalls) {
            capped = true;
            return;
        }
        made += 1;
        const judged = await judgeOne(adapterFor(task.sibling), task.sibling.criteria, task.view, BACKOFF_MS, pause, log);
        appendJsonl(verdictsPath, { ...judged, key: task.key, id: task.row.id, config, repetition: task.repetition, at: new Date().toISOString() });
        consecutive = judged.failure_kind === null ? 0 : consecutive + 1;
        if (consecutive >= STOP_AFTER) {
            stopped = true;
            log(`stopping: ${consecutive} failed judge calls in a row`);
        }
    });

    // Gate on repetition 0 only; repeats measure stability through flips.
    const judged = lastByKey(readJsonl<Judged>(verdictsPath));
    const criteria = [...siblings.values()].flatMap((sibling) => sibling.criteria.map((criterion) => ({ criterion, sibling })));
    const cells: Cell[] = [];
    const gates: Gate[] = [];
    for (const { criterion, sibling } of criteria) {
        const own: Cell[] = [];
        for (const row of rows.filter((candidate) => candidate.eval === sibling.eval)) {
            const isParsed = parsed.some((entry) => entry.row.id === row.id);
            const item = sibling.items.get(row.source);
            const applicable = !isParsed || (item !== undefined && sibling.applies(item, row.answer).has(criterion.id));
            const expected: Expect = applicable ? (row.expected[criterion.id] ?? 'open') : 'open';
            if (!isParsed) {
                own.push({ row, criterion: criterion.id, expected, passed: null, evidence: 'unparsed' });
                continue;
            }
            const verdict = judged.get(keyOf(row.id, config, 0))?.verdicts[criterion.id];
            own.push({ row, criterion: criterion.id, expected, passed: verdict?.passed ?? null, evidence: verdict?.evidence ?? '' });
        }
        cells.push(...own);
        gates.push(gateFor(criterion.id, sibling.eval, own));
    }
    const agreeing = gates.filter((gate) => gate.agrees).map((gate) => gate.id);

    const byItem = new Map<string, Mark[]>();
    for (const entry of parsed) {
        for (const { criterion } of criteria.filter((candidate) => candidate.sibling.eval === entry.sibling.eval)) {
            const marks: Mark[] = [];
            for (let repetition = 0; repetition <= args.repeat; repetition += 1) {
                const record = judged.get(keyOf(entry.row.id, config, repetition));
                if (record !== undefined) marks.push(record.verdicts[criterion.id]?.passed ?? null);
            }
            if (marks.length > 1) byItem.set(`${entry.row.id}|${criterion.id}`, marks);
        }
    }
    const flipped = flips(byItem);

    const header = 'row,eval,criterion,expected,status,passed,evidence';
    const lines = cells.map((cell) => {
        const status = cell.evidence === 'unparsed' ? 'unparsed' : cell.passed === null ? 'missing' : 'judged';
        return [cell.row.id, cell.row.eval, cell.criterion, cell.expected, status, cell.passed === null ? '' : String(cell.passed), cell.evidence]
            .map((value) => csvCell(value))
            .join(',');
    });
    writeFileSync(join(dir, 'results.csv'), `${[header, ...lines].join('\n')}\n`);

    const datasetText = JSON.stringify(rows);
    const summary = {
        label: args.label,
        stub: args.stub,
        model: args.stub ? null : JUDGE.model,
        effort: args.stub ? null : JUDGE.effort,
        dataset: args.dataset,
        datasetSha256: sha256(datasetText),
        criteria: criteriaIds(siblings).length,
        rows: rows.length,
        parsed: parsed.length,
        unparsed: unparsed.map((row) => row.id),
        planned: plan.length,
        judgeCalls: made,
        capped,
        stopped,
        flippedCells: flipped.length,
        agreeing,
        at: new Date().toISOString(),
    };
    writeFileSync(join(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    writeFileSync(join(dir, 'gates.json'), `${JSON.stringify(gates, null, 2)}\n`);
    writeFileSync(join(dir, 'judge-check.json'), `${JSON.stringify(Object.fromEntries(gates.map((gate) => [gate.id, gate.agrees])), null, 2)}\n`);

    const table = gates.map((gate) => `| ${gate.id} | ${gate.eval} | ${percentOrNa(gate.detected)} | ${percentOrNa(gate.accepted)} | ${gate.kappa === null ? 'n/a' : gate.kappa.toFixed(2)} | ${gate.missing} | ${gate.agrees ? 'yes' : 'no'} | ${gate.reasons.join('; ')} |`);
    const notes = [
        `- Mode: ${args.stub ? 'stub judge (no model calls)' : `real judge ${JUDGE.model}, effort ${JUDGE.effort}`}`,
        `- Rows: ${rows.length}; parsed ${parsed.length}; unparsed ${unparsed.length} (${unparsed.map((row) => row.id).join(', ') || 'none'}); not sent to the judge`,
        `- Judge calls made this run: ${made}${capped ? ' (stopped at --max-calls)' : ''}${stopped ? ' (stopped after consecutive failures)' : ''}`,
        `- Repetitions: ${args.repeat} extra; cells whose verdict flipped across repetitions: ${flipped.length}`,
        '- Gate: a criterion agrees with the planted labels when it has 20 must-fail and 20 must-pass cells with a verdict, kappa at least 0.6, and the Wilson lower bound of both rates at least 0.70. Each criterion is gated on its own; judge-check.json lists every criterion with its result.',
        '- Criteria that do not apply to an answer (writer WJ2 and WJ4 without an edit, WJ3 without an add) are open, not scored.',
    ];
    const report = [
        `# Judge agreement, Part B: ${args.label}`,
        '',
        `Criteria shown to agree with the planted labels: ${agreeing.length} of ${gates.length}${agreeing.length === 0 ? '' : ` (${agreeing.join(', ')})`}`,
        '',
        '| Criterion | Eval | Must-fail caught | Must-pass accepted | Kappa | Missing | Agrees | Why not |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        ...table,
        '',
        '## Notes',
        '',
        ...notes,
        '',
    ].join('\n');
    writeFileSync(join(dir, 'report.md'), report);

    log(`wrote ${join(dir, 'report.md')}`);
    console.log(`criteria shown to agree: ${agreeing.length} of ${gates.length}; judge calls this run: ${made}; directory: ${dir}`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
