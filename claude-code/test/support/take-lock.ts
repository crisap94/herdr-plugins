import { setTimeout as delay } from 'node:timers/promises';
import { SessionLock, processAlive, processStartOf } from '../../src/lock.ts';

const [dir = '', session = '', startAt = '0'] = process.argv.slice(2);
const lock = new SessionLock(session, { dir, pid: process.pid, now: Date.now, alive: processAlive, startOf: processStartOf });
while (Date.now() < Number(startAt)) {
    await delay(1);
}
const taken = lock.take();
process.stdout.write(taken.kind);
process.exit(0);
