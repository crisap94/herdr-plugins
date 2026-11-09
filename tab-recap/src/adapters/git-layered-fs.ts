import type { PromiseFsClient } from 'isomorphic-git';
import { promises as fsp } from 'node:fs';
import { ok, type Result } from '#src/protocol/result.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { WorktreeWatch } from '#src/recap/domain/worktree.ts';
import { BAD_PATH_MESSAGE, DEADLINE_MESSAGE, INDEX_FILE, READ_CALLS, READ_ONLY_MESSAGE, SHARED_ENTRIES, WRITE_CALLS } from './git-constants.ts';

export type Disk = typeof fsp;

export class GitDeadline extends Error {
    constructor() {
        super(DEADLINE_MESSAGE);
    }
}

export function routeOf(path: FsPath, layout: WorktreeWatch): Result<FsPath, ParseFailure> {
    const gitDir = `${layout.gitDir}/`;
    if (!path.startsWith(gitDir)) {
        return ok(path);
    }
    const within = path.slice(gitDir.length);
    const [first] = within.split('/');
    if (first === undefined || !SHARED_ENTRIES.has(first)) {
        return ok(path);
    }
    return parseFsPath(`${layout.commonDir}/${within}`);
}

const noop = (): void => undefined;

export function layeredFs(disk: Disk, layout: WorktreeWatch, deadline: Instant): PromiseFsClient {
    const indexPath = `${layout.gitDir}/${INDEX_FILE}`;
    const handler: ProxyHandler<Disk> = {
        get: (target, property) => {
            const member: unknown = Reflect.get(target, property);
            if (typeof property !== 'string' || typeof member !== 'function') {
                return member;
            }
            if (READ_CALLS.has(property)) {
                return new Proxy(member, {
                    apply: (method, self, args) => {
                        if (Date.now() > deadline) {
                            return Promise.reject(new GitDeadline());
                        }
                        const cells: readonly unknown[] = args;
                        const [first, ...rest] = cells;
                        const checked = parseFsPath(first);
                        const routed = checked.kind === 'ok' ? routeOf(checked.value, layout) : checked;
                        if (routed.kind === 'err') {
                            return Promise.reject(new Error(BAD_PATH_MESSAGE));
                        }
                        const result: unknown = Reflect.apply(method, self, [routed.value, ...rest]);
                        return result;
                    },
                });
            }
            if (WRITE_CALLS.has(property)) {
                return new Proxy(noop, {
                    apply: (_method, _self, args) => {
                        const cells: readonly unknown[] = args;
                        const [first] = cells;
                        if (property === 'writeFile' && first === indexPath) {
                            return Promise.resolve();
                        }
                        return Promise.reject(new Error(READ_ONLY_MESSAGE));
                    },
                });
            }
            return member;
        },
    };
    return { promises: new Proxy(disk, handler) };
}
