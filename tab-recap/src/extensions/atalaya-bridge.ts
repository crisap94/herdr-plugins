import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { obj, parse, str } from '#src/adapters/jsonl.ts';
import { run } from '#src/adapters/process.ts';
import type { Runner } from '#src/adapters/process.ts';
import type { Locale } from '#src/i18n/messages.ts';
import type { Extension, ExtensionFactory, Note, NotesResult, UpkeepResult } from '#src/ports/extension.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory, type Directory } from '#src/recap/domain/directory.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parsePaneId, type PaneId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { duration, instant, type Duration, type Instant } from '#src/recap/domain/time.ts';

const UNIT = 'atalaya-bridge.service';
const STALE_MS = 180_000;
const HEAL_EVERY_MS = 300_000;
const MINUTE_MS = 60_000;

export type { Runner } from '#src/adapters/process.ts';

type Heal = 'on' | 'off';

function currentUid(): Count | undefined {
    const uid = parseCount(process.getuid?.());
    return uid.kind === 'ok' ? uid.value : undefined;
}

interface Alert {
    readonly pane: PaneId;
    readonly note: Note;
}

interface Cache {
    readonly mtime: Instant | null;
    readonly notes: ReadonlyMap<PaneId, readonly Note[]>;
}

function expandHome(path: Text): Text {
    return path === '~' || path.startsWith('~/') ? must(parseText(join(homedir(), path.slice(1)))) : path;
}

export function userBusEnv(base: NodeJS.ProcessEnv, uid: Count | undefined): NodeJS.ProcessEnv {
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

function alertOf(line: Text): Alert | null {
    const row = parse(line);
    const episode = obj(row?.['episode']);
    const pane = parsePaneId(str(episode['pane']));
    const kind = str(episode['kind']);
    if (row === null || pane.kind === 'err' || kind === null) {
        return null;
    }
    const evidence = obj(row['evidence']);
    const unmerged = evidence['unmerged'];
    const details = [str(evidence['branch']), typeof unmerged === 'number' ? `${unmerged} unmerged` : null, str(evidence['tree'])];
    return { pane: pane.value, note: { label: kind, at: typeof row['at'] === 'number' ? row['at'] : 0, details: details.filter((part) => part !== null) } };
}

function silence(locale: Locale, silent: Duration): Text {
    const minutes = Math.max(1, Math.round(silent / MINUTE_MS));
    return must(parseText(locale === 'es'
        ? `atalaya-bridge sin señal desde hace ${minutes} min — intentando arrancarlo`
        : `atalaya-bridge silent for ${minutes} min — healing`));
}

export class AtalayaBridge implements Extension {
    readonly id = 'atalaya-bridge';
    private readonly dir: Directory;
    private readonly healing: () => Heal;
    private readonly runner: Runner;
    private readonly clock: () => Instant;
    private readonly env: NodeJS.ProcessEnv;
    private cache: Cache = { mtime: null, notes: new Map() };
    private lastHeal: Instant = instant(0);

    constructor(dir: Directory, healing: () => Heal, runner: Runner = run, clock: () => Instant = (): Instant => instant(Date.now()), env: NodeJS.ProcessEnv = process.env) {
        this.env = env;
        this.dir = dir;
        this.healing = healing;
        this.runner = runner;
        this.clock = clock;
    }

    private heartbeat(): Instant | null {
        try {
            const at = Number(readFileSync(join(this.dir, 'heartbeat'), 'utf8').trim());
            return Number.isFinite(at) && at > 0 ? instant(at) : null;
        } catch {
            return null;
        }
    }

    private latest(): ReadonlyMap<PaneId, readonly Note[]> {
        const log = join(this.dir, 'atalaya-log.jsonl');
        const mtime = instant(statSync(log).mtimeMs);
        if (mtime !== this.cache.mtime) {
            const notes = new Map<PaneId, readonly Note[]>();
            for (const found of readFileSync(log, 'utf8').split('\n').map((line) => alertOf(must(parseText(line))))) {
                if (found !== null) {
                    notes.set(found.pane, [found.note]);
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

    warning(locale: Locale): Text | null {
        const beat = this.heartbeat();
        const age = duration(beat === null ? 0 : this.clock() - beat);
        return age < STALE_MS ? null : silence(locale, age);
    }

    async upkeep(): Promise<UpkeepResult> {
        const beat = this.heartbeat();
        const now = this.clock();
        if (this.healing() === 'off' || beat === null || now - beat < STALE_MS || now - this.lastHeal < HEAL_EVERY_MS) {
            return { kind: 'idle' };
        }
        this.lastHeal = now;
        const opts = { input: '', timeoutMs: 15_000, cwd: this.dir, env: userBusEnv(this.env, currentUid()) };
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
    const dir = parseDirectory(expandHome(must(parseText(get('TAB_RECAP_BRIDGE_DIR') ?? join(homedir(), '.local', 'state', 'atalaya-bridge')))));
    try {
        return dir.kind === 'ok' && statSync(dir.value).isDirectory() ? new AtalayaBridge(dir.value, () => (get('TAB_RECAP_BRIDGE_HEAL') === '0' ? 'off' : 'on')) : null;
    } catch {
        return null;
    }
};
