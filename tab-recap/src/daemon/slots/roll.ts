import type { Line, Mode, Running, SlotContext, SlotModule } from '../slots.ts';
import type { Activity, Successor } from '../view/roll.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';

export const defaultOn: Mode = 'on';

const WAITER = 'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; exec "$2" "$3" ensure';

export const slot: SlotModule = {
    start: async (context: SlotContext): Promise<Running> => {
        const processes = await import('node:child_process');
        const url = await import('node:url');
        const plugin = await import('#src/adapters/os/plugin-version.ts');
        const installs = await import('#src/adapters/herdr/active-install.ts');
        const paths = await import('#src/recap/domain/fs-path.ts');
        const result = await import('#src/protocol/result.ts');
        const slots = await import('../slots.ts');
        const view = await import('../view/roll.ts');
        const own = result.must(paths.parseFsPath(url.fileURLToPath(new URL('../../../bin/tab-recap.mjs', import.meta.url))));
        const herdr = new installs.HerdrActiveInstalls();
        const report = (line: Line): void => {
            context.log(line);
        };
        return view.startRoll({
            started: context.version,
            active: () => herdr.active(),
            local: (): Successor => {
                const version = plugin.codeVersion();
                return { version: version === null ? null : slots.parseVersion(version), launcher: own };
            },
            activity(): Activity {
                return context.store.compactions.autoInProgress() ? 'compacting' : 'idle';
            },
            spawnWaiter: (launcher: FsPath): void => {
                report(slots.parseLine(`roll: handing over to ${launcher}`));
                const child = processes.spawn('sh', ['-c', WAITER, 'sh', String(process.pid), process.execPath, launcher], { detached: true, stdio: 'ignore' });
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
