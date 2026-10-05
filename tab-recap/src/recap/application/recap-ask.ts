// Asking the writer for the tab's recap, and turning its answer into tasks. The job decides WHEN; this decides what is asked and kept.
import { saying, isUnknown } from '#src/ports/unknowable.ts';
import type { TabRecap } from '#src/ports/recap-store.ts';
import type { RecapRequest, Summarizer, TaskGroup } from '#src/ports/summarizer.ts';
import { settle, unexplained } from '#src/recap/domain/tasks.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import { parseProposal } from './recap-tasks.ts';
import { renderRecap } from './recap-shape.ts';

/** The writer gets two tries at answering in the fixed shape. */
const ATTEMPTS = 2;

export type Asked = { readonly kind: 'tasks'; readonly tasks: readonly RecapTask[]; readonly cost: number } | { readonly kind: 'failed'; readonly error: string; readonly cost: number };

/**
 * The previous recap as the writer gets it: with one task, that task's sections as JSON (as ever) or, for a recap
 * from before the fixed structure, its Markdown; with several, one JSON object per task.
 */
const asData = (task: RecapTask): unknown => task.sections ?? { markdown: task.markdown };

export function previousFor(prior: TabRecap): string {
    const [only, ...more] = prior.tasks;
    if (only === undefined) {
        return '';
    }
    if (more.length === 0) {
        return only.sections === null ? only.markdown : JSON.stringify(only.sections);
    }
    return JSON.stringify({ tasks: prior.tasks.map((task) => ({ id: task.id, name: task.name, lanes: task.lanes, recap: asData(task) })) });
}

export const groupingOf = (prior: TabRecap): readonly TaskGroup[] => prior.tasks.map(({ id, name, lanes }) => ({ id, name, lanes }));

type Judged = { readonly kind: 'tasks'; readonly tasks: readonly RecapTask[] } | { readonly kind: 'again'; readonly why: string };

/** The answer as tasks, or what to tell the writer: unusable, naming no lane, or moving lanes between tasks with no evidence (while a retry is left). */
function judge(text: string, prior: TabRecap, panes: readonly string[], language: 'en' | 'es', retryLeft: boolean): Judged {
    const parsed = parseProposal(text, panes);
    if (parsed.kind === 'invalid') {
        return { kind: 'again', why: parsed.why };
    }
    if (retryLeft && unexplained(prior.tasks, parsed.proposal, panes)) {
        return { kind: 'again', why: 'you moved agents between tasks without saying why: keep the CURRENT TASKS, or give the evidence in "regroup"' };
    }
    const tasks = settle(prior.tasks, parsed.proposal, panes).map((task) => ({ id: task.id, name: task.name, lanes: task.lanes, sections: task.sections, markdown: renderRecap(task.sections, language) }));
    return tasks.length === 0 ? { kind: 'again', why: 'no task names any of the agents' } : { kind: 'tasks', tasks };
}

/**
 * The writer's answer must be the seven sections (per task) as JSON. One retry, saying what was wrong; if it is
 * still unusable the previous recap stays (with an error line) and the cursors do not advance.
 */
export async function ask(summarizer: Summarizer, request: RecapRequest, prior: TabRecap, panes: readonly string[], language: 'en' | 'es'): Promise<Asked> {
    let cost = 0;
    let correction: string | undefined;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
        const written = await summarizer.write(correction === undefined ? request : { ...request, correction });
        if (isUnknown(written)) {
            return { kind: 'failed', error: saying(written.why), cost };
        }
        cost += written.costUsd;
        const judged = judge(written.text, prior, panes, language, attempt < ATTEMPTS - 1);
        if (judged.kind === 'tasks') {
            return { kind: 'tasks', tasks: judged.tasks, cost };
        }
        correction = judged.why;
    }
    return { kind: 'failed', error: `the writer's answer was not usable (${correction ?? 'unknown'}); the previous recap is kept`, cost };
}
