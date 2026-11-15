import { statusMatrix, walk, TREE, STAGE } from 'isomorphic-git';
import type { WalkerEntry, WalkerMap } from 'isomorphic-git';
import { err, ok, type Result } from '#src/protocol/result.ts';
import { parseGitPath } from '#src/recap/domain/git-path.ts';
import type { GitPath } from '#src/recap/domain/git-path.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { HEAD_REF } from './constants.ts';
import type { Handle } from './reach.ts';

export interface Changes {
    readonly tracked: readonly GitPath[];
    readonly untracked: readonly GitPath[];
}

export interface Moved {
    readonly path: GitPath;
    readonly oid: Text | null;
}

export type Status = 0 | 1 | 2 | 3;
export type Entries = readonly Entry[];

export interface Entry {
    readonly path: GitPath;
    readonly head: Status;
    readonly workdir: Status;
    readonly stage: Status;
}

interface BlobOids {
    readonly head: Text | null;
    readonly stage: Text | null;
}

const ROOT = '.';
const TREE_MODE = 0o40000;
const UNTRACKED_HEAD: Status = 0;
const UNTRACKED_STAGE: Status = 0;
const UNTRACKED_WORKDIR: Status = 2;
const STAGED_DELETE_HEAD: Status = 1;
const STAGED_DELETE_STAGE: Status = 0;
const STAGED_ADD_HEAD: Status = 0;
const STAGED_ADD_STAGE: Status = 2;
const SAME: Status = 1;
const SEPARATOR = '/';

export function renamedFrom(deleted: readonly Moved[], added: readonly Moved[]): readonly GitPath[] {
    const byOid = new Map<Text, GitPath>();
    for (const gone of deleted) {
        if (gone.oid !== null && !byOid.has(gone.oid)) {
            byOid.set(gone.oid, gone.path);
        }
    }
    const from: GitPath[] = [];
    for (const arrived of added) {
        const source = arrived.oid === null ? undefined : byOid.get(arrived.oid);
        if (source !== undefined && arrived.oid !== null) {
            from.push(source);
            byOid.delete(arrived.oid);
        }
    }
    return from;
}

function keepOk(parsed: Result<GitPath, ParseFailure>): readonly GitPath[] {
    return parsed.kind === 'ok' ? [parsed.value] : [];
}

function ancestorsOf(path: GitPath): readonly GitPath[] {
    const parts = path.split(SEPARATOR);
    return parts.slice(0, -1).flatMap((_, index) => keepOk(parseGitPath(parts.slice(0, index + 1).join(SEPARATOR))));
}

export function collapsedOf(untracked: readonly GitPath[], trackedDirs: ReadonlySet<GitPath>): Result<readonly GitPath[], ParseFailure> {
    const shown = new Set<string>();
    for (const file of untracked) {
        const top = ancestorsOf(file).find((dir) => !trackedDirs.has(dir));
        shown.add(top === undefined ? file : `${top}${SEPARATOR}`);
    }
    const names: GitPath[] = [];
    for (const name of shown) {
        const checked = parseGitPath(name);
        if (checked.kind === 'err') {
            return checked;
        }
        names.push(checked.value);
    }
    return ok(names);
}

async function oidOf(entry: WalkerEntry | null): Promise<Text | null> {
    if (entry === null || (await entry.mode()) === TREE_MODE) {
        return null;
    }
    const oid = parseText(await entry.oid());
    return oid.kind === 'ok' ? oid.value : null;
}

async function oidsOf(handle: Handle, paths: ReadonlySet<GitPath>): Promise<ReadonlyMap<GitPath, BlobOids>> {
    const found = new Map<GitPath, BlobOids>();
    const map: WalkerMap = async (path, [head, stage]) => {
        const checked = parseGitPath(path);
        if (path === ROOT || checked.kind === 'err' || !paths.has(checked.value)) {
            return undefined;
        }
        found.set(checked.value, { head: await oidOf(head ?? null), stage: await oidOf(stage ?? null) });
        return undefined;
    };
    await walk({ fs: handle.fs, dir: handle.dir, gitdir: handle.gitdir, trees: [TREE({ ref: HEAD_REF }), STAGE()], map });
    return found;
}

export function parseStatus(input: unknown): Result<Status, ParseFailure> {
    if (input === 0 || input === 1 || input === 2 || input === 3) {
        return ok(input);
    }
    return err({ kind: 'out-of-range' });
}

export function parseEntry(row: unknown): Result<Entry, ParseFailure> {
    if (!Array.isArray(row) || row.length !== 4) {
        return err({ kind: 'not-a-row' });
    }
    const cells: readonly unknown[] = row;
    const [raw, headRaw, workdirRaw, stageRaw] = cells;
    const path = parseGitPath(raw);
    const head = parseStatus(headRaw);
    const workdir = parseStatus(workdirRaw);
    const stage = parseStatus(stageRaw);
    if (path.kind === 'err') {
        return path;
    }
    if (head.kind === 'err') {
        return head;
    }
    if (workdir.kind === 'err') {
        return workdir;
    }
    if (stage.kind === 'err') {
        return stage;
    }
    return ok({ path: path.value, head: head.value, workdir: workdir.value, stage: stage.value });
}

export function parseEntries(rows: unknown): Result<Entries, ParseFailure> {
    if (!Array.isArray(rows)) {
        return err({ kind: 'not-a-row' });
    }
    const entries: Entry[] = [];
    for (const row of rows) {
        const parsed = parseEntry(row);
        if (parsed.kind === 'err') {
            return parsed;
        }
        entries.push(parsed.value);
    }
    return ok(entries);
}

function ancestorsOfTracked(entries: readonly Entry[]): ReadonlySet<GitPath> {
    const dirs = new Set<GitPath>();
    for (const entry of entries) {
        for (const dir of ancestorsOf(entry.path)) {
            dirs.add(dir);
        }
    }
    return dirs;
}

export async function changesOf(handle: Handle): Promise<Result<Changes, ParseFailure>> {
    const parsed = parseEntries(await statusMatrix({ fs: handle.fs, dir: handle.dir, gitdir: handle.gitdir }));
    if (parsed.kind === 'err') {
        return parsed;
    }
    const entries = parsed.value;
    const untracked = entries.filter((e) => e.head === UNTRACKED_HEAD && e.stage === UNTRACKED_STAGE && e.workdir === UNTRACKED_WORKDIR);
    const content = entries.filter((e) => e.head !== UNTRACKED_HEAD || e.stage !== UNTRACKED_STAGE);
    const tracked = content.filter((e) => !(e.head === SAME && e.stage === SAME && e.workdir === SAME));
    const deleted = tracked.filter((e) => e.head === STAGED_DELETE_HEAD && e.stage === STAGED_DELETE_STAGE);
    const added = tracked.filter((e) => e.head === STAGED_ADD_HEAD && e.stage === STAGED_ADD_STAGE);
    const renamed = new Set<GitPath>();
    if (deleted.length > 0 && added.length > 0) {
        const oids = await oidsOf(handle, new Set([...deleted, ...added].map((e) => e.path)));
        const from = renamedFrom(
            deleted.map((e) => ({ path: e.path, oid: oids.get(e.path)?.head ?? null })),
            added.map((e) => ({ path: e.path, oid: oids.get(e.path)?.stage ?? null })),
        );
        for (const path of from) {
            renamed.add(path);
        }
    }
    const collapsed = collapsedOf(
        untracked.map((e) => e.path),
        ancestorsOfTracked(content),
    );
    if (collapsed.kind === 'err') {
        return collapsed;
    }
    return ok({
        tracked: tracked.filter((e) => !renamed.has(e.path)).map((e) => e.path),
        untracked: collapsed.value,
    });
}
