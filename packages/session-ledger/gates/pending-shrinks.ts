import { execFileSync } from 'node:child_process';

export type PairSpec = {
    readonly pending: string;
    readonly cases: string;
};

export type PairSnapshot = {
    readonly pending: string;
    readonly headPending: readonly string[];
    readonly basePending: readonly string[];
    readonly baseCases: readonly string[];
};

const CASE_ID = /\b[A-Z]{3}-\d+\b/g;

export function shrinkViolations(snapshots: readonly PairSnapshot[]): readonly string[] {
    return snapshots.flatMap((snapshot) => {
        const basePending = new Set(snapshot.basePending);
        const baseCases = new Set(snapshot.baseCases);
        return snapshot.headPending
            .filter((id) => !basePending.has(id) && baseCases.has(id))
            .map((id) => `${id} is added to ${snapshot.pending} for a case that already exists at the merge base`);
    });
}

export function pendingShrinks(pairs: readonly PairSpec[], mergeBase: string): readonly string[] {
    return shrinkViolations(
        pairs.map((pair) => ({
            pending: pair.pending,
            headPending: pendingIds('HEAD', pair.pending),
            basePending: pendingIds(mergeBase, pair.pending),
            baseCases: caseIds(mergeBase, pair.cases),
        })),
    );
}

function git(args: readonly string[]): string {
    return execFileSync('git', [...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function filesAt(ref: string): readonly string[] {
    return git(['ls-tree', '-r', '--full-tree', '--name-only', ref])
        .split('\n')
        .filter((path) => path !== '');
}

function textAt(ref: string, path: string): string {
    return git(['show', `${ref}:${path}`]);
}

function globToRegExp(glob: string): RegExp {
    const body = glob
        .split('*')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*');
    return new RegExp(`^${body}$`);
}

function pendingIds(ref: string, glob: string): readonly string[] {
    const matcher = globToRegExp(glob);
    return filesAt(ref)
        .filter((path) => matcher.test(path))
        .flatMap((path) => {
            const parsed: unknown = JSON.parse(textAt(ref, path));
            if (!Array.isArray(parsed)) {
                throw new Error(`${path} is not a JSON array of ids`);
            }
            return parsed.filter((id): id is string => typeof id === 'string');
        });
}

function caseIds(ref: string, folder: string): readonly string[] {
    const prefix = `${folder.replace(/\/+$/, '')}/`;
    return filesAt(ref)
        .filter((path) => path.startsWith(prefix) && path.endsWith('.ts'))
        .flatMap((path) => [...textAt(ref, path).matchAll(CASE_ID)].map(([id]) => id));
}

function parsePairs(args: readonly string[]): readonly PairSpec[] {
    if (args.length === 0 || args.length % 2 !== 0) {
        throw new Error('usage: pending-shrinks.ts <pending-glob> <case-folder> [<pending-glob> <case-folder> ...]');
    }
    const pairs: PairSpec[] = [];
    for (let index = 0; index < args.length; index += 2) {
        const [pending = '', cases = ''] = args.slice(index, index + 2);
        pairs.push({ pending, cases });
    }
    return pairs;
}

function baseSha(): string {
    const fromCi = process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA;
    if (fromCi !== undefined && fromCi !== '') {
        return fromCi;
    }
    return git(['merge-base', 'origin/main', 'HEAD']).trim();
}

if (import.meta.main) {
    const violations = pendingShrinks(parsePairs(process.argv.slice(2)), baseSha());
    for (const line of violations) {
        process.stdout.write(`${line}\n`);
    }
    process.exitCode = violations.length > 0 ? 1 : 0;
}
