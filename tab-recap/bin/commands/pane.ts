import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { configGetter } from '#src/daemon/config.ts';

const NOT_COVERED = 3;
const USAGE = 2;
const FAILED = 1;
const LAUNCH = fileURLToPath(new URL('../../src/pane/launch.mjs', import.meta.url));
const MODES: ReadonlyMap<string, Readonly<Record<string, string>>> = new Map([
    ['column', { TAB_RECAP_MODE: '', TAB_RECAP_SHAPE: '' }],
    ['modal', { TAB_RECAP_MODE: 'modal', TAB_RECAP_SHAPE: '' }],
    ['bar', { TAB_RECAP_MODE: '', TAB_RECAP_SHAPE: 'bar' }],
]);

export function paneEnvOf(args: readonly string[], env: NodeJS.ProcessEnv): NodeJS.ProcessEnv | null {
    try {
        const { values, positionals } = parseArgs({ args: [...args], options: { mode: { type: 'string', default: 'column' } }, allowPositionals: true, strict: true });
        const mode = MODES.get(values.mode);
        if (mode === undefined || positionals.length > 1) {
            return null;
        }
        return { ...env, ...mode, TAB_RECAP_TAB: positionals[0] ?? env['TAB_RECAP_TAB'] ?? '' };
    } catch {
        return null;
    }
}

export function run(args: readonly string[]): number {
    if (configGetter()('TAB_RECAP_VIEW_SERVER') !== 'on') {
        console.error('tab-recap: 3 — pane: not available');
        return NOT_COVERED;
    }
    const env = paneEnvOf(args, process.env);
    if (env === null) {
        console.error('tab-recap: 2 — USAGE: tab-recap pane [<tab>] [--mode column|modal|bar]');
        return USAGE;
    }
    if (typeof process.execve === 'function') {
        process.execve(process.execPath, [process.execPath, LAUNCH], env);
    }
    return spawnSync(process.execPath, [LAUNCH], { stdio: 'inherit', env }).status ?? FAILED;
}
