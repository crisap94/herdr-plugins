// Work a Claude agent started and has not ended, read from the tail of its transcript. Pure over lines.
import type { InFlightResult } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { arr, obj, parse, str } from './jsonl.ts';
import type { Row } from './jsonl.ts';

const ENDED = new Set(['completed', 'failed', 'killed', 'stopped']);
const LAUNCHERS = new Set(['Agent', 'Task', 'Monitor']);

/** Launched work by tool-use id, with the task ids its results announce (a notification echoes either id). */
interface Launch { readonly agentTool: boolean; readonly tasks: Set<string> }

const textOf = (content: unknown): string =>
    typeof content === 'string' ? content : arr(content).map((block) => str(block['text']) ?? '').join('');

const tagged = (text: string, tag: string): string | null => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(text)?.[1]?.trim() || null;

/** The task id a launch's result states: the structured field first, else the words ("with ID: x", "(task x"). */
function taskOf(result: Row, text: string): string | null {
    const words = /\bID: (\w+)|\(task (\w+)/.exec(text);
    return str(result['backgroundTaskId']) ?? str(result['taskId']) ?? str(result['agentId']) ?? words?.[1] ?? words?.[2] ?? null;
}

const asynchronous = (result: Row, text: string): boolean => result['isAsync'] === true || result['status'] === 'async_launched' || text.startsWith('Async agent launched');

/** An assistant row's launches. */
function launched(row: Row, launches: Map<string, Launch>): void {
    if (row['type'] !== 'assistant' || row['isSidechain'] === true) return;
    for (const block of arr(obj(row['message'])['content'])) {
        const name = str(block['name']) ?? '';
        const id = str(block['id']);
        if (block['type'] === 'tool_use' && id !== null && (obj(block['input'])['run_in_background'] === true || LAUNCHERS.has(name))) launches.set(id, { agentTool: name === 'Agent' || name === 'Task', tasks: new Set() });
    }
}

/** A task notification that ends something; true when the row was a notification at all. */
function notified(text: string, launches: Map<string, Launch>): boolean {
    if (!text.trimStart().startsWith('<task-notification>')) return false;
    const [task, tool, status] = [tagged(text, 'task-id'), tagged(text, 'tool-use-id'), tagged(text, 'status')];
    if (status === null || !ENDED.has(status)) return true;
    for (const [id, launch] of launches) if (id === tool || (task !== null && launch.tasks.has(task))) launches.delete(id);
    return true;
}

/** A launch's own result: it names the task id, and an agent that did not go to the background has ended with it. */
function answered(row: Row, launches: Map<string, Launch>): void {
    for (const block of arr(obj(row['message'])['content'])) {
        const id = str(block['tool_use_id']) ?? '';
        const launch = launches.get(id);
        if (block['type'] !== 'tool_result' || launch === undefined) continue;
        const [result, said] = [obj(row['toolUseResult']), textOf(block['content'])];
        const task = taskOf(result, said);
        if (task !== null) launch.tasks.add(task);
        if (launch.agentTool && !asynchronous(result, said)) launches.delete(id);
    }
}

/** Launches with no ending notification after them. A launch the tail cuts off is not seen; a tail with no parsable line is `Unknown`. */
export function claudeInFlight(lines: readonly string[]): InFlightResult {
    const rows = lines.map((line) => parse(line)).filter((row): row is Row => row !== null);
    if (rows.length === 0 && lines.some((line) => line.trim() !== '')) return unknown({ why: 'unreadable', detail: 'no line of the transcript tail parses' });
    const launches = new Map<string, Launch>();
    for (const row of rows) {
        launched(row, launches);
        if (row['type'] === 'user' && !notified(textOf(obj(row['message'])['content']), launches)) answered(row, launches);
    }
    return { kind: 'in-flight', count: launches.size };
}
