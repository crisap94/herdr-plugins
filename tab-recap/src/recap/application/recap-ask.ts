// Asking the writer for the tab's recap, and turning its answer into tasks. The job decides WHEN; this decides what is asked and kept.
import { saying, isUnknown } from '#src/ports/unknowable.ts';
import type { TabRecap } from '#src/ports/recap-records.ts';
import type { TaskGroup } from '#src/ports/recap-input.ts';
import type { RecapRequest, Summarizer } from '#src/ports/summarizer.ts';
import { settle, unexplained } from '#src/recap/domain/tasks.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import { correctionOf, gate, NO_STATS, statsOf } from './gatekeeper.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import { parseProposal } from './recap-tasks.ts';
import { renderRecap } from './recap-shape.ts';

/** The writer gets two tries at answering in the fixed shape. */
const ATTEMPTS = 2;

export type Asked = { readonly kind: 'tasks'; readonly tasks: readonly RecapTask[]; readonly cost: number; readonly stats: GateStats } | { readonly kind: 'failed'; readonly error: string; readonly cost: number };

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

/** The task with its Markdown drawn again, after items were dropped. */
const redrawn = (task: RecapTask, language: 'en' | 'es'): RecapTask => (task.sections === null ? task : { ...task, markdown: renderRecap(task.sections, language) });

/** What a refused-then-retried run falls back to when the retry cannot be used: the first answer without its refused items. */
interface Fallback {
    readonly tasks: readonly RecapTask[];
    readonly stats: GateStats;
}

/**
 * The writer's answer must be the seven sections (per task) as JSON, and pass the gates. One retry, saying what was
 * wrong (the shape, or the refused items); items still refused after it are dropped and the rest kept. If the answer is
 * still unusable the previous recap stays (with an error line) and the cursors do not advance.
 */
export async function ask(summarizer: Summarizer, request: RecapRequest, prior: TabRecap, panes: readonly string[], language: 'en' | 'es'): Promise<Asked> {
    const agents = request.input.agents.flatMap((agent) => [agent.id, agent.label, agent.kind]);
    let cost = 0;
    let correction: string | undefined;
    let stats = NO_STATS;
    let fallback: Fallback | null = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
        const written = await summarizer.write(correction === undefined ? request : { ...request, correction });
        if (isUnknown(written)) {
            return fallback === null ? { kind: 'failed', error: saying(written.why), cost } : { kind: 'tasks', ...fallback, cost };
        }
        cost += written.costUsd;
        const judged = judge(written.text, prior, panes, language, attempt < ATTEMPTS - 1);
        if (judged.kind === 'again') {
            correction = judged.why;
            continue;
        }
        const gated = gate(judged.tasks, { language: request.language, agents });
        const tasks = gated.tasks.map((task) => redrawn(task, language));
        if (gated.refusals.length > 0 && attempt < ATTEMPTS - 1) {
            fallback = { tasks, stats: statsOf(gated, stats, true) };
            stats = statsOf(gated, stats, false);
            correction = correctionOf(gated.refusals);
            continue;
        }
        return { kind: 'tasks', tasks, cost, stats: statsOf(gated, stats, true) };
    }
    return fallback === null ? { kind: 'failed', error: `the writer's answer was not usable (${correction ?? 'unknown'}); the previous recap is kept`, cost } : { kind: 'tasks', ...fallback, cost };
}
