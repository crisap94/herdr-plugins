import { statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { GitLaneRepo, gitEnv } from '#src/adapters/git-lane-repo.ts';
import { run } from '#src/adapters/process.ts';
import type { Runner } from '#src/adapters/process.ts';
import { SystemClock } from '#src/adapters/system-clock.ts';
import { messagesFor } from '#src/i18n/index.ts';
import type { Locale } from '#src/i18n/messages.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { Extension, ExtensionFactory, Note, NotesResult } from '#src/ports/extension.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { TabLane } from '#src/ports/tab-views.ts';

export const GIT_NOTE_MARK = '⎇';
export const STATUS_ARGS: readonly string[] = ['-c', 'core.fsmonitor=false', 'status', '--porcelain=v2', '--branch'];
export const TIMEOUT_MS = 1500;
export const TTL_MS = 5000;
const FORGET_MS = 60_000;
const DETACHED = '(detached)';

export interface GitStatus {
    readonly branch: string;
    readonly ahead: number | null;
    readonly changed: number;
}

export function parseStatus(text: string): GitStatus {
    let head = '';
    let oid = '';
    let ahead: number | null = null;
    let changed = 0;
    for (const line of text.split('\n')) {
        if (line.startsWith('# branch.head ')) {
            head = line.slice('# branch.head '.length).trim();
        } else if (line.startsWith('# branch.oid ')) {
            oid = line.slice('# branch.oid '.length).trim();
        } else if (line.startsWith('# branch.ab ')) {
            ahead = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
        } else if (/^[12u?] /.test(line)) {
            changed += 1;
        }
    }
    return { branch: head === DETACHED ? oid.slice(0, 7) : head, ahead, changed };
}

export function noteOf(status: GitStatus, locale: Locale): Note {
    const m = messagesFor(locale);
    const details = [
        ...(status.ahead === null || status.ahead === 0 ? [] : [m.git.unpushed(status.ahead)]),
        ...(status.changed === 0 ? [] : [m.git.changed(status.changed)]),
    ];
    return { label: status.branch, at: null, details, mark: GIT_NOTE_MARK };
}

async function watchedFiles(root: string): Promise<readonly string[]> {
    const dotGit = join(root, '.git');
    let gitDir = dotGit;
    try {
        if (statSync(dotGit).isFile()) {
            const pointer = /^gitdir:\s*(.+)$/m.exec(await readFile(dotGit, 'utf8'))?.[1]?.trim();
            gitDir = pointer === undefined ? dotGit : resolve(root, pointer);
        }
    } catch {
        return [];
    }
    return [join(gitDir, 'HEAD'), join(gitDir, 'index')];
}

function stamp(files: readonly string[]): string {
    return files.map((file) => {
        try { return String(statSync(file).mtimeMs); } catch { return '-'; }
    }).join(':');
}

interface Entry {
    readonly status: GitStatus | null;
    readonly at: number;
    readonly files: readonly string[];
    readonly stamp: string;
    seen: number;
}

const NOTHING_KNOWN: Entry = { status: null, at: 0, files: [], stamp: '', seen: 0 };

export interface GitNoteDeps {
    readonly get: (key: string) => string | undefined;
    readonly repo: LaneRepo;
    readonly runner: Runner;
    readonly clock: Clock;
}

class GitNote implements Extension {
    readonly id = 'git-note';
    private readonly cache = new Map<string, Entry>();
    private readonly refreshing = new Set<string>();
    private readonly deps: GitNoteDeps;

    constructor(deps: GitNoteDeps) {
        this.deps = deps;
    }

    notes(lanes: readonly TabLane[] = [], locale: Locale = 'en'): NotesResult {
        const byPane = new Map<string, readonly Note[]>();
        if ((this.deps.get('TAB_RECAP_GIT_NOTE') ?? 'on').trim().toLowerCase() === 'off') {
            return { kind: 'notes', byPane };
        }
        const now = this.deps.clock.now();
        for (const lane of lanes) {
            const entry = lane.cwd === null ? undefined : this.look(lane.cwd, now);
            if (entry?.status !== undefined && entry.status !== null) {
                byPane.set(lane.pane, [noteOf(entry.status, locale)]);
            }
        }
        this.forget(now);
        return { kind: 'notes', byPane };
    }

    private look(cwd: string, now: number): Entry | undefined {
        const entry = this.cache.get(cwd);
        if (entry !== undefined) {
            entry.seen = now;
        }
        if ((entry === undefined || now - entry.at >= TTL_MS || stamp(entry.files) !== entry.stamp) && !this.refreshing.has(cwd)) {
            this.refreshing.add(cwd);
            void this.refresh(cwd, entry);
        }
        return entry;
    }

    private async refresh(cwd: string, previous: Entry | undefined): Promise<void> {
        try {
            const entry = await this.ask(cwd, previous);
            this.cache.set(cwd, entry);
        } catch {
            const at = this.deps.clock.now();
            this.cache.set(cwd, { ...(previous ?? NOTHING_KNOWN), at, stamp: '', seen: at });
        } finally {
            this.refreshing.delete(cwd);
        }
    }

    private async ask(cwd: string, previous: Entry = NOTHING_KNOWN): Promise<Entry> {
        const at = this.deps.clock.now();
        const found = await this.deps.repo.repoOf(cwd);
        if (found.kind === 'no-repo') {
            return { ...NOTHING_KNOWN, at, seen: at };
        }
        if (found.kind === 'unknown') {
            return { ...previous, at, seen: at };
        }
        const files = await watchedFiles(found.root);
        const before = stamp(files);
        return { status: await this.status(cwd, previous.status), at, files, stamp: before, seen: at };
    }

    private async status(cwd: string, known: GitStatus | null): Promise<GitStatus | null> {
        const result = await this.deps.runner('git', STATUS_ARGS, { input: '', timeoutMs: TIMEOUT_MS, cwd, env: gitEnv() });
        return result.code === 0 && !result.timedOut ? parseStatus(result.stdout) : known;
    }

    private forget(now: number): void {
        for (const [cwd, entry] of this.cache) {
            if (now - entry.seen > FORGET_MS) {
                this.cache.delete(cwd);
            }
        }
    }
}

export function createGitNote(deps: GitNoteDeps): Extension {
    return new GitNote(deps);
}

export const gitNote: ExtensionFactory = (get) => {
    const clock = new SystemClock();
    return createGitNote({ get, repo: new GitLaneRepo(clock), runner: run, clock });
};
