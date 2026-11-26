import type { Text } from '@stateforge-labs/session-ledger';
import { brand } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import assert from 'node:assert/strict';
import type { Recap } from '@stateforge-labs/session-ledger';
import type { Workplaces } from '@stateforge-labs/session-ledger';
import type { InputAgent, RecapInput } from '@stateforge-labs/session-ledger';
import type { RecapRequest } from '@stateforge-labs/session-ledger';
import type { Entry } from '@stateforge-labs/session-ledger';
import type { RecapSections } from '@stateforge-labs/session-ledger';
import type { RecapTask } from '@stateforge-labs/session-ledger';
import { opsOfSections } from '#src/adapters/db/import/sections-to-ops.ts';
import type { TaskOps } from '@stateforge-labs/session-ledger';
import { paneIdOf } from '#src/recap/domain/ids.ts';

export const NO_REPOS: Workplaces = { repoOf: () => Promise.resolve({ kind: 'no-repo' }) };

export const oneTask = (markdown: string, sections: RecapSections | null = null, lanes: readonly string[] = []): readonly RecapTask[] =>
    [{ id: textOf('t1'), name: textOf(''), sessions: lanes.map((lane) => paneIdOf(lane)), sections, markdown: textOf(markdown) }];

export const withFacts = (tasks: readonly RecapTask[]): { readonly tasks: readonly RecapTask[]; readonly ops: readonly TaskOps[] } =>
    ({ tasks, ops: tasks.map((task) => ({ task: task.id, ops: task.sections === null ? [] : opsOfSections(task.sections) })) });

export function firstTask(recap: Recap | null): RecapTask {
    const task = recap?.tasks[0];
    assert.ok(task !== undefined, 'the recap has a task');
    return task;
}

export const agentOf = (id: string, over: Partial<InputAgent> = {}): InputAgent =>
    ({ id: textOf(id), kind: brand<string, 'HarnessKind'>('claude'), label: textOf(''), key: brand<string, 'SessionKey'>(`w1:p${id.slice(1)}`), source: 'transcript', cwd: null, repo: null, branch: null, files: [], ...over });

export function requestOf(over: Partial<RecapInput> & { readonly entries?: readonly Entry[]; readonly language?: Text; readonly previousLanguage?: Text; readonly correction?: Text } = {}): RecapRequest {
    const { entries = [], language = textOf('en'), previousLanguage = textOf('en'), correction, ...input } = over;
    const agents = input.agents ?? [agentOf('a1')];
    return {
        language, previousLanguage, ...(correction === undefined ? {} : { correction }),
        input: { scope: { id: textOf('w1:t1'), now: instant(Date.parse('2026-10-06T03:05:00Z')), zone: textOf('UTC') }, agents, tasks: [], ledgers: [{ task: null, facts: [] }], notes: [], transcripts: [{ agent: agents[0]?.id ?? textOf('a1'), entries }], ...input },
    };
}
