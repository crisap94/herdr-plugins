import { createConnection } from 'node:net';
import { LEAVE } from '../wire/view/paint.ts';
import { cookedExecve, relayEnvOf } from './relay-env.ts';
import { runRelay } from './relay.ts';

const PLUGIN_ROOT = new URL('../../', import.meta.url);

if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
}
process.on('SIGTERM', () => { process.exit(0); });
process.on('exit', () => { process.stdout.write(LEAVE); });
await runRelay(relayEnvOf(process.env, PLUGIN_ROOT), {
    connect: createConnection,
    out: process.stdout,
    colour: { colour: process.stdout.isTTY && process.stdout.hasColors() },
    input: process.stdin,
    setTimeout,
    clearTimeout,
    now: () => Date.now(),
    execve: typeof process.execve === 'function' ? cookedExecve(process.stdin, process.execve.bind(process)) : null,
    exit: (code) => process.exit(code),
    seen: null,
});
