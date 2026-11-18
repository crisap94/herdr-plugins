import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PENDING_PATH = 'packages/session-ledger/gates/e2e-pending.json';

export type FileAtBase = (entryFile: string) => 'existed' | 'new';

const PACKAGE_DIR = 'packages/session-ledger';
const UNSTABLE = './unstable/';

export function sourceOf(entryFile: string): string {
    return entryFile.startsWith(UNSTABLE) ? `${PACKAGE_DIR}/src/${entryFile.slice(UNSTABLE.length)}` : `${PACKAGE_DIR}/${entryFile.replace(/^\.\//u, '')}`;
}

export function pendingGrowth(head: readonly string[], base: readonly string[] | null, atBase: FileAtBase = () => 'existed'): readonly string[] {
    const before = new Set(base ?? []);
    return head
        .filter((entry) => !before.has(entry))
        .filter((entry) => atBase(entry.split(' ')[0] ?? '') === 'existed')
        .map((entry) => `${entry} is added to ${PENDING_PATH}; the list only shrinks against the merge base (only an export of a file that is new since then may enter it)`);
}

function git(args: readonly string[]): string {
    return execFileSync('git', [...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function entriesOf(text: string): readonly string[] {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) {
        throw new Error(`${PENDING_PATH} is not a JSON array`);
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string');
}

function entriesAt(ref: string): readonly string[] | null {
    const listed = git(['ls-tree', '--name-only', ref, '--', PENDING_PATH]).trim();
    return listed === '' ? null : entriesOf(git(['show', `${ref}:${PENDING_PATH}`]));
}

function baseSha(): string {
    const fromCi = process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA;
    if (fromCi !== undefined && fromCi !== '') {
        return fromCi;
    }
    return git(['merge-base', 'origin/main', 'HEAD']).trim();
}

if (import.meta.main) {
    const top = git(['rev-parse', '--show-toplevel']).trim();
    const head = entriesOf(readFileSync(join(top, PENDING_PATH), 'utf8'));
    const base = baseSha();
    const atBase: FileAtBase = (entryFile) => (git(['ls-tree', '--name-only', base, '--', sourceOf(entryFile)]).trim() === '' ? 'new' : 'existed');
    const violations = pendingGrowth(head, entriesAt(base), atBase);
    for (const line of violations) {
        process.stdout.write(`${line}\n`);
    }
    process.exitCode = violations.length > 0 ? 1 : 0;
}
