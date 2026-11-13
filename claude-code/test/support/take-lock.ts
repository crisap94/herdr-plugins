import { setTimeout as delay } from 'node:timers/promises';
import { DEFAULT_MAX_HOLD_MS, SessionLock, processAlive } from '../../src/lock.ts';

const [dir = '', session = '', startAt = '0'] = process.argv.slice(2);
const lock = new SessionLock(session, { dir, pid: process.pid, now: Date.now, alive: processAlive, maxHoldMs: DEFAULT_MAX_HOLD_MS });
while (Date.now() < Number(startAt)) {
    await delay(1);
}
const taken = lock.take();
process.stdout.write(taken.kind);
process.exit(0);
