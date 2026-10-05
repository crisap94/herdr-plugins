// Shared by the tests that build recaps: a tab with one task, and a LaneRepo that knows no repository.
import assert from 'node:assert/strict';
import type { TabRecap } from '#src/ports/recap-store.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';

export const NO_REPOS: LaneRepo = { repoOf: () => Promise.resolve({ kind: 'no-repo' }) };

/** One task holding every lane, as a tab with one piece of work has. */
export const oneTask = (markdown: string, sections: RecapSections | null = null, lanes: readonly string[] = []): readonly RecapTask[] =>
    [{ id: 't1', name: '', lanes, sections, markdown }];

/** The tab's first task, which must exist. */
export function firstTask(recap: TabRecap | null): RecapTask {
    const task = recap?.tasks[0];
    assert.ok(task !== undefined, 'the recap has a task');
    return task;
}
