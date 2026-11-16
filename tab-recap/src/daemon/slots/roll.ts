import type { Line, Mode, Running, SlotContext, SlotModule, Version } from '../slots.ts';
import type { Activity } from '../view/roll.ts';

export const defaultOn: Mode = 'off';

const WAITER = 'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; exec "$2" "$3" ensure';

export const slot: SlotModule = {
    start: async (context: SlotContext): Promise<Running> => {
        const processes = await import('node:child_process');
        const url = await import('node:url');
        const plugin = await import('#src/adapters/os/plugin-version.ts');
        const slots = await import('../slots.ts');
        const view = await import('../view/roll.ts');
        const bin = url.fileURLToPath(new URL('../../../bin/tab-recap.mjs', import.meta.url));
        const report = (line: Line): void => {
            context.log(line);
        };
        return view.startRoll({
            started: context.version,
            diskVersion: (): Version | null => {
                const version = plugin.codeVersion();
                return version === null ? null : slots.parseVersion(version);
            },
            activity(): Activity {
                return context.store.compactions.autoInProgress() ? 'compacting' : 'idle';
            },
            spawnWaiter: (): void => {
                const child = processes.spawn('sh', ['-c', WAITER, 'sh', String(process.pid), process.execPath, bin], { detached: true, stdio: 'ignore' });
                child.on('error', (error: Error): void => {
                    report(slots.parseLine(`roll: waiter ${error.message}`));
                });
                child.unref();
            },
            terminate: (): void => {
                process.kill(process.pid, 'SIGTERM');
            },
            log: report,
        });
    },
};
