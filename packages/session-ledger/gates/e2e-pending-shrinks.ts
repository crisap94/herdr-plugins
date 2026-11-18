import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PENDING_PATH = 'packages/session-ledger/gates/e2e-pending.json';

export function pendingGrowth(head: readonly string[], base: readonly string[] | null): readonly string[] {
    if (base === null) {
        return [];
    }
    const before = new Set(base);
    return head
        .filter((entry) => !before.has(entry))
        .map((entry) => `${entry} is added to ${PENDING_PATH}; the list only shrinks against the merge base`);
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
    const violations = pendingGrowth(head, entriesAt(baseSha()));
    for (const line of violations) {
        process.stdout.write(`${line}\n`);
    }
    process.exitCode = violations.length > 0 ? 1 : 0;
}
