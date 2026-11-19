import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import { foldSwept, type RunRef, type TaskOps } from '#src/recap/domain/ops.ts';
import type { Applied, CheckedLedger, Ledger } from '#src/ports/ledger.ts';
import { saying, type Unknown } from '#src/ports/unknowable.ts';
import type { Instant } from '#src/recap/domain/time.ts';

const FOLD_WINDOW_MS = 24 * 3_600_000;

interface FoldRun extends Omit<RunRef, 'id' | 'task'> { readonly owner: Omit<TaskId, 'key'> }

function known(found: readonly Fact[] | Unknown): readonly Fact[] {
    if ('kind' in found) throw new Error(saying(found.why));
    return found;
}

export function throwingLedger(ledger: CheckedLedger): Omit<Ledger, 'keysOf'> {
    return { ...ledger, openOf: (task: TaskId) => known(ledger.openOf(task)), recentlyClosed: (task: TaskId, since: Instant) => known(ledger.recentlyClosed(task, since)) };
}

function inOrder(facts: readonly Fact[]): readonly Fact[] {
    const sorted: Fact[] = [];
    for (const fact of facts) {
        const at = sorted.findIndex((other) => other.firstAt > fact.firstAt || (other.firstAt === fact.firstAt && other.id > fact.id));
        sorted.splice(at === -1 ? sorted.length : at, 0, fact);
    }
    return sorted;
}

export function foldedRun(ledger: Pick<Ledger, 'openOf' | 'recentlyClosed'>, asked: readonly TaskOps[], run: FoldRun): Applied {
    const changed: Fact[] = [];
    const refused: Applied['refused'][number][] = [];
    for (const one of asked) {
        const task: TaskId = { ...run.owner, key: one.task };
        const before = inOrder([...ledger.openOf(task), ...ledger.recentlyClosed(task, run.at - FOLD_WINDOW_MS)]);
        const folded = foldSwept(before, one.ops, { task, at: run.at, language: run.language, mint: run.mint });
        changed.push(...folded.changed);
        refused.push(...folded.refused);
    }
    return { changed, refused };
}
