import assert from 'node:assert/strict';
import type { TabRecap } from '#src/ports/recap-records.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { InputAgent, RecapInput } from '#src/ports/recap-input.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import { opsOfSections } from '#src/adapters/db/import/sections-to-ops.ts';
import type { TaskOps } from '#src/recap/domain/ops.ts';

export const NO_REPOS: LaneRepo = { repoOf: () => Promise.resolve({ kind: 'no-repo' }) };

export const oneTask = (markdown: string, sections: RecapSections | null = null, lanes: readonly string[] = []): readonly RecapTask[] =>
    [{ id: 't1', name: '', lanes, sections, markdown }];

export const withFacts = (tasks: readonly RecapTask[]): { readonly tasks: readonly RecapTask[]; readonly ops: readonly TaskOps[] } =>
    ({ tasks, ops: tasks.map((task) => ({ task: task.id, ops: task.sections === null ? [] : opsOfSections(task.sections) })) });

export function firstTask(recap: TabRecap | null): RecapTask {
    const task = recap?.tasks[0];
    assert.ok(task !== undefined, 'the recap has a task');
    return task;
}

export const agentOf = (id: string, over: Partial<InputAgent> = {}): InputAgent =>
    ({ id, kind: 'claude', label: '', pane: `w1:p${id.slice(1)}`, source: 'transcript', cwd: null, repo: null, branch: null, files: [], ...over });

export function requestOf(over: Partial<RecapInput> & { readonly entries?: readonly Entry[]; readonly language?: string; readonly previousLanguage?: string; readonly correction?: string } = {}): RecapRequest {
    const { entries = [], language = 'en', previousLanguage = 'en', correction, ...input } = over;
    const agents = input.agents ?? [agentOf('a1')];
    return {
        language, previousLanguage, ...(correction === undefined ? {} : { correction }),
        input: { tab: { id: 'w1:t1', now: Date.parse('2026-10-06T03:05:00Z'), zone: 'UTC' }, agents, tasks: [], ledgers: [{ task: null, facts: [] }], notes: [], transcripts: [{ agent: agents[0]?.id ?? 'a1', entries }], ...input },
    };
}
