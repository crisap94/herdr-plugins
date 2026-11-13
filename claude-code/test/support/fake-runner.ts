import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROC_STAT = `/proc/${process.pid}/stat`;

function sessionOf(): number {
    if (existsSync(PROC_STAT)) {
        const stat = readFileSync(PROC_STAT, 'utf8');
        const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        return Number(fields[3]);
    }
    return Number(spawnSync('ps', ['-o', 'sid=', '-p', String(process.pid)], { encoding: 'utf8' }).stdout.trim());
}

const stateDir = process.env['SESSION_LEDGER_STATE_DIR'] ?? '';
appendFileSync(join(stateDir, 'fake-runner.jsonl'), `${JSON.stringify({ args: process.argv.slice(2), pid: process.pid, sid: sessionOf() })}\n`);
