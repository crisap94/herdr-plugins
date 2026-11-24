import { spawn } from 'node:child_process';
import type { KillMode, ProcessPort } from '#src/ports/process-control.ts';
import type { Count } from '@stateforge-labs/session-ledger';
import { runIn } from './core.ts';
import type { Flavour, Spawner } from './core.ts';

const killGroup = (pid: Count, mode: KillMode): void => {
    process.kill(-Number(pid), mode === 'force' ? 'SIGKILL' : 'SIGTERM');
};

export function posixProcess(spawner: Spawner = spawn): ProcessPort {
    const flavour: Flavour = { spawner, detached: 'detached', killTree: killGroup };
    return { run: (command, args, options) => runIn(flavour, command, args, options), killTree: killGroup };
}
