import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { obj, parse, str } from '#src/adapters/jsonl.ts';
import { run } from '#src/adapters/process.ts';
import type { RunOptions, RunResult } from '#src/adapters/process.ts';
import type { Locale } from '#src/i18n/messages.ts';
import type { Extension, ExtensionFactory, Note, NotesResult, UpkeepResult } from '#src/ports/extension.ts';
import { unknown } from '#src/ports/unknowable.ts';

const UNIT = 'atalaya-bridge.service';
const STALE_MS = 180_000;
const HEAL_EVERY_MS = 300_000;
const MINUTE_MS = 60_000;

export type Runner = (command: string, args: readonly string[], options: RunOptions) => Promise<RunResult>;

function expandHome(path: string): string {
    return path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(1)) : path;
}

export function userBusEnv(base: NodeJS.ProcessEnv, uid: number | undefined): NodeJS.ProcessEnv {
    if (uid === undefined) {
        return base;
    }
    const runtime = `/run/user/${uid}`;
    return {
        ...base,
        XDG_RUNTIME_DIR: (base['XDG_RUNTIME_DIR'] ?? '') === '' ? runtime : base['XDG_RUNTIME_DIR'],
        DBUS_SESSION_BUS_ADDRESS: (base['DBUS_SESSION_BUS_ADDRESS'] ?? '') === '' ? `unix:path=${runtime}/bus` : base['DBUS_SESSION_BUS_ADDRESS'],
    };
}

function alertOf(line: string): [string, Note] | null {
    const row = parse(line);
    const episode = obj(row?.['episode']);
    const pane = str(episode['pane']);
    const kind = str(episode['kind']);
    if (row === null || pane === null || kind === null) {
        return null;
    }
    const evidence = obj(row['evidence']);
    const unmerged = evidence['unmerged'];
    const details = [str(evidence['branch']), typeof unmerged === 'number' ? `${unmerged} unmerged` : null, str(evidence['tree'])];
    return [pane, { label: kind, at: typeof row['at'] === 'number' ? row['at'] : 0, details: details.filter((part) => part !== null) }];
}

function silence(locale: Locale, ms: number): string {
    const minutes = Math.max(1, Math.round(ms / MINUTE_MS));
    return locale === 'es'
        ? `atalaya-bridge sin señal desde hace ${minutes} min — intentando arrancarlo`
        : `atalaya-bridge silent for ${minutes} min — healing`;
}

export class AtalayaBridge implements Extension {
    readonly id = 'atalaya-bridge';
    private readonly dir: string;
    private readonly get: (key: string) => string | undefined;
    private readonly runner: Runner;
    private readonly clock: () => number;
    private readonly env: NodeJS.ProcessEnv;
    private cache: { mtime: number; notes: ReadonlyMap<string, readonly Note[]> } = { mtime: -1, notes: new Map() };
    private lastHeal = 0;

    constructor(dir: string, get: (key: string) => string | undefined, runner: Runner = run, clock: () => number = Date.now, env: NodeJS.ProcessEnv = process.env) {
        this.env = env;
        this.dir = dir;
        this.get = get;
        this.runner = runner;
        this.clock = clock;
    }

    private heartbeat(): number | null {
        try {
            const at = Number(readFileSync(join(this.dir, 'heartbeat'), 'utf8').trim());
            return Number.isFinite(at) && at > 0 ? at : null;
        } catch {
            return null;
        }
    }

    private latest(): ReadonlyMap<string, readonly Note[]> {
        const log = join(this.dir, 'atalaya-log.jsonl');
        const mtime = statSync(log).mtimeMs;
        if (mtime !== this.cache.mtime) {
            const notes = new Map<string, readonly Note[]>();
            for (const found of readFileSync(log, 'utf8').split('\n').map(alertOf)) {
                if (found !== null) {
                    notes.set(found[0], [found[1]]);
                }
            }
            this.cache = { mtime, notes };
        }
        return this.cache.notes;
    }

    notes(): NotesResult {
        try {
            return { kind: 'notes', byPane: this.latest() };
        } catch (error) {
            return unknown({ why: 'unreadable', detail: error instanceof Error ? error.message : String(error) });
        }
    }

    warning(locale: Locale): string | null {
        const beat = this.heartbeat();
        const age = beat === null ? 0 : this.clock() - beat;
        return age < STALE_MS ? null : silence(locale, age);
    }

    async upkeep(): Promise<UpkeepResult> {
        const beat = this.heartbeat();
        const now = this.clock();
        if (this.get('TAB_RECAP_BRIDGE_HEAL') === '0' || beat === null || now - beat < STALE_MS || now - this.lastHeal < HEAL_EVERY_MS) {
            return { kind: 'idle' };
        }
        this.lastHeal = now;
        const opts = { input: '', timeoutMs: 15_000, cwd: this.dir, env: userBusEnv(this.env, process.getuid?.()) };
        if ((await this.runner('systemctl', ['--user', 'is-active', '--quiet', UNIT], opts)).code === 0) {
            return { kind: 'idle' };
        }
        const started = await this.runner('systemctl', ['--user', 'start', UNIT], opts);
        return started.code === 0
            ? { kind: 'acted', saying: `${UNIT} was down: started it` }
            : unknown({ why: 'failed', code: started.code, detail: started.stderr.trim() });
    }
}

export const atalayaBridge: ExtensionFactory = (get) => {
    const dir = expandHome(get('TAB_RECAP_BRIDGE_DIR') ?? join(homedir(), '.local', 'state', 'atalaya-bridge'));
    try {
        return dir !== '' && statSync(dir).isDirectory() ? new AtalayaBridge(dir, get) : null;
    } catch {
        return null;
    }
};
