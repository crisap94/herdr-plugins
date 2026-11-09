import { getConfig, log, resolveRef, currentBranch, Errors } from 'isomorphic-git';
import { ok, type Result } from '#src/protocol/result.ts';
import type { LastCommit } from '#src/ports/worksite-reader.ts';
import type { AheadCount } from '#src/recap/domain/porcelain.ts';
import type { BranchName } from '#src/recap/domain/porcelain.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { WebBase } from '#src/ports/lane-repo.ts';
import { webOf } from './remote-web.ts';
import {
    AHEAD_DEPTH,
    BRANCH_CONFIG_PREFIX,
    BRANCH_PREFIX,
    DETACHED_LABEL,
    HEAD_REF,
    LOCAL_REMOTE,
    ORIGIN_URL_PATH,
    REMOTE_PREFIX,
    SHORT_HASH,
} from './git-constants.ts';
import type { Handle } from './git-reach.ts';

type BranchKey = 'remote' | 'merge';

async function branchConfigOf(handle: Handle, branch: BranchName, key: BranchKey): Promise<Result<Text, ParseFailure>> {
    return parseText(await getConfig({ fs: handle.fs, gitdir: handle.gitdir, path: `${BRANCH_CONFIG_PREFIX}.${branch}.${key}` }));
}

async function originUrlOf(handle: Handle): Promise<Result<Text, ParseFailure>> {
    return parseText(await getConfig({ fs: handle.fs, gitdir: handle.gitdir, path: ORIGIN_URL_PATH }));
}

export async function branchOf(handle: Handle): Promise<Result<BranchName | null, ParseFailure>> {
    const name = await currentBranch({ fs: handle.fs, dir: handle.dir, gitdir: handle.gitdir, fullname: false });
    if (typeof name !== 'string') {
        return ok(null);
    }
    return parseText(name);
}

export async function headLabelOf(handle: Handle): Promise<Result<BranchName, ParseFailure>> {
    const branch = await branchOf(handle);
    if (branch.kind === 'err') {
        return branch;
    }
    if (branch.value !== null) {
        return ok(branch.value);
    }
    const oid = await resolveRef({ fs: handle.fs, dir: handle.dir, gitdir: handle.gitdir, ref: HEAD_REF }).catch(() => null);
    return parseText(oid === null ? DETACHED_LABEL : oid.slice(0, SHORT_HASH));
}

export async function aheadOf(handle: Handle, branch: BranchName): Promise<Result<AheadCount, ParseFailure>> {
    const remote = await branchConfigOf(handle, branch, 'remote');
    const merge = await branchConfigOf(handle, branch, 'merge');
    if (remote.kind === 'err' || merge.kind === 'err' || !merge.value.startsWith(BRANCH_PREFIX)) {
        return ok(null);
    }
    const remoteName = remote.value;
    const mergeName = merge.value;
    const short = mergeName.slice(BRANCH_PREFIX.length);
    const upstream = remoteName === LOCAL_REMOTE ? `${BRANCH_PREFIX}${short}` : `${REMOTE_PREFIX}${remoteName}/${short}`;
    try {
        const theirs = new Set((await log({ fs: handle.fs, dir: handle.dir, gitdir: handle.gitdir, ref: upstream, depth: AHEAD_DEPTH })).map((entry) => entry.oid));
        const mine = await log({ fs: handle.fs, dir: handle.dir, gitdir: handle.gitdir, ref: HEAD_REF, depth: AHEAD_DEPTH });
        return parseCount(mine.filter((entry) => !theirs.has(entry.oid)).length);
    } catch (error) {
        if (error instanceof Errors.NotFoundError) {
            return ok(null);
        }
        throw error;
    }
}

export async function lastCommitOf(handle: Handle): Promise<LastCommit | null> {
    try {
        const top = (await log({ fs: handle.fs, dir: handle.dir, gitdir: handle.gitdir, ref: HEAD_REF, depth: 1 }))[0];
        if (top === undefined) {
            return null;
        }
        return { hash: top.oid.slice(0, SHORT_HASH), subject: top.commit.message.split('\n')[0] ?? '' };
    } catch (error) {
        if (error instanceof Errors.NotFoundError) {
            return null;
        }
        throw error;
    }
}

export async function originWebOf(handle: Handle): Promise<WebBase | null> {
    const url = await originUrlOf(handle);
    return url.kind === 'ok' ? webOf(url.value) : null;
}
