import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import { foldSwept, type RunRef, type TaskOps } from '#src/recap/domain/ops.ts';
import type { Applied, CheckedLedger, Ledger } from '#src/ports/ledger.ts';
import { saying, type Unknown } from '#src/ports/unknowable.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import type { RunAccomplishment } from './ledger-reconcile.ts';

const FOLD_WINDOW_MS = 24 * 3_600_000;

interface FoldRun extends Omit<RunRef, 'id' | 'task'> { readonly owner: Omit<TaskId, 'key'> }

export interface TaskRead { readonly task: TaskShape; readonly facts: readonly Fact[] | Unknown }

export function accomplishedOf(before: readonly TaskRead[], after: readonly TaskRead[], at: Instant, unreported: (failure: Unknown) => void): RunAccomplishment[] {
    const unknown = [...before, ...after].map((read) => read.facts).find((facts): facts is Unknown => 'kind' in facts);
    if (unknown !== undefined) {
        unreported(unknown);
        return [];
    }
    const factsOf = (read: TaskRead): readonly Fact[] => ('kind' in read.facts ? [] : read.facts);
    const seen = new Set(before.flatMap(factsOf).map((fact) => fact.id));
    return after.flatMap((read) => factsOf(read).filter((fact) => fact.section === 'done' && !seen.has(fact.id)).map((fact) => ({ task: read.task, fact, at })));
}

function known(found: readonly Fact[] | Unknown): readonly Fact[] {
    if ('kind' in found) throw new Error(saying(found.why));
    return found;
}

export function throwingLedger(ledger: CheckedLedger): Omit<Ledger, 'keysOf'> {
    return { ...ledger, openOf: (task: TaskId) => known(ledger.openOf(task)), recentlyClosed: (task: TaskId, since: Instant) => known(ledger.recentlyClosed(task, since)), allOf: (task: TaskId) => known(ledger.allOf(task)) };
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
        const before = inOrder([...ledger.openOf(task), ...ledger.recentlyClosed(task, instant(run.at - FOLD_WINDOW_MS))]);
        const folded = foldSwept(before, one.ops, { task, at: run.at, language: run.language, mint: run.mint });
        changed.push(...folded.changed);
        refused.push(...folded.refused);
    }
    return { changed, refused };
}
