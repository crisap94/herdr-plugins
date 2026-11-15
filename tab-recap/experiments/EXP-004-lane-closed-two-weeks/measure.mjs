import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const STATE = process.env['TAB_RECAP_STATE'] ?? join(homedir(), '.local', 'state', 'herdr', 'plugins', 'tab-recap');
const SINCE = Date.parse(process.argv[2] ?? '2026-10-11T11:30:00Z');
const UNTIL = process.argv[3] === undefined ? Date.now() : Date.parse(process.argv[3]);
const WRITER_RAN_MS = 10_000;
const MIN_DAYS = 7;
const BASELINE_PER_DAY = 15 / (38 / 24);

const db = new DatabaseSync(join(STATE, 'tab-recap.db'), { readOnly: true });
const days = (UNTIL - SINCE) / 86_400_000;
const rows = (sql, ...params) => db.prepare(sql).all(...params).map((row) => ({ ...row }));
const table = (head, body) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...body.map((cells) => `| ${cells.join(' | ')} |`)].join('\n');
const fixed = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : 'n/a');
const median = (values) => {
    const sorted = [...values].toSorted((a, b) => a - b);
    return sorted.length === 0 ? Number.NaN : sorted[Math.floor(sorted.length / 2)];
};

const ends = rows("SELECT id, pane, origin, stage, why, started_at, finished_at FROM compaction_readable WHERE started_at >= ? AND started_at < ?", SINCE, UNTIL);
const closed = ends.filter((row) => row.stage === 'skipped' && row.why === 'lane closed');
const withWriter = closed.filter((row) => (row.finished_at ?? row.started_at) - row.started_at >= WRITER_RAN_MS);
const remaining = ends.filter((row) => row.stage === 'failed' && String(row.why).includes('agent_not_found'));
const typed = ends.filter((row) => ['compacted', 'failed', 'unconfirmed'].includes(row.stage) || (row.stage === 'skipped' && row.why === 'lane closed'));

const statusOf = rows("SELECT hex(compaction_id) AS cid, lane_status FROM autocompact_decision WHERE compaction_id IS NOT NULL AND at >= ? AND at < ?", SINCE, UNTIL);
const byCompaction = new Map(statusOf.map((row) => [row.cid, row.lane_status]));
const idHex = (readable) => readable.replaceAll('-', '').toUpperCase();
const autoClosed = closed.filter((row) => row.origin === 'auto');
const statuses = autoClosed.map((row) => byCompaction.get(idHex(row.id)) ?? null);
const share = (status) => (statuses.length === 0 ? Number.NaN : statuses.filter((each) => each === status).length / statuses.length);

const log = (() => {
    try {
        return readFileSync(join(STATE, 'daemon.log'), 'utf8').split('\n');
    } catch {
        return [];
    }
})();
const points = new Map();
for (const line of log) {
    const found = /compaction: .* closed, skipped \((.+)\)$/u.exec(line);
    const at = Date.parse(line.slice(0, 24));
    if (found !== null && at >= SINCE && at < UNTIL) points.set(found[1], (points.get(found[1]) ?? 0) + 1);
}

const perDay = withWriter.length / days;
const printed = [
    `# Lane closed: ${new Date(SINCE).toISOString()} to ${new Date(UNTIL).toISOString()} (${fixed(days, 1)} days)`,
    '',
    `Baseline before the change: ${fixed(BASELINE_PER_DAY, 1)} a day (15 \`agent_not_found\` failures in about 38 h, 14 after a written brief).`,
    '',
    table(['measure', 'value'], [
        ['compaction records in the window', String(ends.length)],
        ['reached the typing stage or ended lane closed', String(typed.length)],
        ['ended skipped, lane closed', String(closed.length)],
        ['of those, the writer ran (at least 10 s from start to end)', String(withWriter.length)],
        ['lane closed ends with the writer, per day', fixed(perDay, 2)],
        ['share of the baseline rate', fixed(perDay / BASELINE_PER_DAY, 2)],
        ['median seconds from start to end of a lane closed end', fixed(median(closed.map((row) => ((row.finished_at ?? row.started_at) - row.started_at) / 1000)), 1)],
        ['total seconds spent before a lane closed end', fixed(closed.reduce((sum, row) => sum + ((row.finished_at ?? row.started_at) - row.started_at) / 1000, 0), 0)],
        ['still failed with agent_not_found (expected 0)', String(remaining.length)],
    ]),
    '',
    'Lane closed ends by origin',
    table(['origin', 'ends'], ['auto', 'operator', 'request'].map((origin) => [origin, String(closed.filter((row) => row.origin === origin).length)])),
    '',
    'Automatic lane closed ends by the lane status at the decision',
    table(['lane status', 'ends', 'share'], ['idle', 'done', 'working', null].map((status) => [status ?? 'not recorded', String(statuses.filter((each) => each === status).length), fixed(share(status), 2)])),
    '',
    'Lane closed ends by where the compaction was (from the daemon log; the log rotates, so it can undercount)',
    table(['point', 'log lines'], [...points.entries()].toSorted().map(([point, count]) => [point, String(count)])),
    '',
    'Decision rules (EXP-004 PREREG.md)',
    days < MIN_DAYS ? `- NO DECISION: the window is ${fixed(days, 1)} days, the rules need at least ${MIN_DAYS}` : `- C2, cancel the writer when the lane closes: ${perDay >= BASELINE_PER_DAY * 0.5 ? 'SPECIFY (the rate with the writer is at least half of the baseline)' : perDay < BASELINE_PER_DAY * 0.2 ? 'DROP (below a fifth of the baseline)' : 'EXTEND one more week (between a fifth and a half)'}`,
    ...(days < MIN_DAYS ? [] : [`- E, do not brief done lanes below the ceiling: ${autoClosed.length < 10 ? 'NO DECISION (fewer than 10 automatic lane closed ends)' : share('done') >= 0.6 ? 'EVALUATE (at least 60 % of the closed lanes were done)' : share('done') < 0.25 ? 'DROP (under 25 % were done)' : 'EXTEND one more week'}`]),
];
console.log(printed.join('\n'));
db.close();
