import { add, commit, init, remove } from 'isomorphic-git';
import { mkdirSync, mkdtempSync, promises as fsp, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Disk } from '#src/adapters/git-layered-fs.ts';

export const AUTHOR = { name: 't', email: 't@t' };

export interface Fixture {
    readonly root: string;
    readonly clean: () => void;
}

export function scratch(prefix: string): Fixture {
    const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
    return { root, clean: (): void => { rmSync(root, { recursive: true, force: true }); } };
}

function writeAll(root: string, files: Readonly<Record<string, string>>): void {
    for (const [name, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, name)), { recursive: true });
        writeFileSync(join(root, name), text);
    }
}

export async function commitFiles(root: string, files: Readonly<Record<string, string>>, message: string): Promise<void> {
    writeAll(root, files);
    for (const name of Object.keys(files)) {
        await add({ fs: { promises: fsp }, dir: root, filepath: name });
    }
    await commit({ fs: { promises: fsp }, dir: root, message, author: AUTHOR });
}

export async function makeRepo(prefix: string, files: Readonly<Record<string, string>>): Promise<Fixture> {
    const fixture = scratch(prefix);
    await init({ fs: { promises: fsp }, dir: fixture.root, defaultBranch: 'main' });
    await commitFiles(fixture.root, files, 'first');
    return fixture;
}

export async function stage(root: string, name: string): Promise<void> {
    await add({ fs: { promises: fsp }, dir: root, filepath: name });
}

export async function unstage(root: string, name: string): Promise<void> {
    await remove({ fs: { promises: fsp }, dir: root, filepath: name });
}

export async function makeLinked(main: string, name: string): Promise<string> {
    const linked = join(main, `${name}-wt`);
    const gitdir = join(main, '.git', 'worktrees', name);
    mkdirSync(gitdir, { recursive: true });
    mkdirSync(linked, { recursive: true });
    writeFileSync(join(gitdir, 'commondir'), '../..\n');
    writeFileSync(join(gitdir, 'gitdir'), `${join(linked, '.git')}\n`);
    writeFileSync(join(gitdir, 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(linked, '.git'), `gitdir: ${gitdir}\n`);
    return realpathSync(linked);
}

export function slowDisk(disk: Disk, delayMs: number): Disk {
    const wrapped = {
        ...disk,
        readFile: async (...args: Parameters<Disk['readFile']>): ReturnType<Disk['readFile']> => {
            await new Promise<void>((resolve) => { setTimeout(resolve, delayMs); });
            return disk.readFile(...args);
        },
    };
    return wrapped as Disk;
}

export function stuckDisk(disk: Disk): Disk {
    const never = new Promise<never>(() => undefined);
    return { ...disk, readFile: (): Promise<never> => never };
}
