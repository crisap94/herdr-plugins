// Work a Claude agent started and has not ended, read from the tail of its transcript. Pure over lines.
import type { InFlightResult } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { arr, obj, parse, str } from './jsonl.ts';
import type { Row } from './jsonl.ts';

/** The most bytes the in-flight reader reads back for one question: 16 MB, past which the answer is unknown. */
export const IN_FLIGHT_MAX_BYTES = 16 * 1024 * 1024;

const ENDED = new Set(['completed', 'failed', 'killed', 'stopped']);
const LAUNCHERS = new Set(['Agent', 'Task', 'Monitor']);

/** Launched work by tool-use id, with the task ids its results announce (a notification echoes either id). `expiresAfter` is a
 * Monitor's own `timeout_ms`, the longest it runs; `startedAt` is when the launch was written, both in milliseconds (null when unknown). */
interface Launch { readonly agentTool: boolean; readonly tasks: Set<string>; readonly startedAt: number | null; readonly expiresAfter: number | null }

const textOf = (content: unknown): string =>
    typeof content === 'string' ? content : arr(content).map((block) => str(block['text']) ?? '').join('');

const tagged = (text: string, tag: string): string | null => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(text)?.[1]?.trim() || null;

/** A row's time in milliseconds, or null when it has none. */
const stamped = (row: Row): number | null => {
    const at = Date.parse(str(row['timestamp']) ?? '');
    return Number.isFinite(at) ? at : null;
};

/** The task id a launch's result states: the structured field first, else the words ("with ID: x", "(task x"). */
function taskOf(result: Row, text: string): string | null {
    const words = /\bID: (\w+)|\(task (\w+)/.exec(text);
    return str(result['backgroundTaskId']) ?? str(result['taskId']) ?? str(result['agentId']) ?? words?.[1] ?? words?.[2] ?? null;
}

const asynchronous = (result: Row, text: string): boolean => result['isAsync'] === true || result['status'] === 'async_launched' || text.startsWith('Async agent launched');

/** The launch a content block of an assistant row starts, with its id; null when the block starts none. */
function launchOf(block: Row, row: Row): { readonly id: string; readonly launch: Launch } | null {
    const name = str(block['name']) ?? '';
    const id = str(block['id']);
    const input = obj(block['input']);
    if (block['type'] !== 'tool_use' || id === null || (input['run_in_background'] !== true && !LAUNCHERS.has(name))) return null;
    const timeout = name === 'Monitor' && typeof input['timeout_ms'] === 'number' ? input['timeout_ms'] : null;
    return { id, launch: { agentTool: name === 'Agent' || name === 'Task', tasks: new Set(), startedAt: stamped(row), expiresAfter: timeout } };
}

/** An assistant row's launches. */
function launched(row: Row, launches: Map<string, Launch>): void {
    if (row['type'] !== 'assistant' || row['isSidechain'] === true) return;
    for (const block of arr(obj(row['message'])['content'])) {
        const found = launchOf(block, row);
        if (found !== null) launches.set(found.id, found.launch);
    }
}

/** `none`: not a notification; `seen`: a notification that ends nothing, or ends a launch seen (or one already ended); `unseen`: it ends a launch the scan never saw. */
type Notice = 'none' | 'seen' | 'unseen';

/** Ends every launch a notice names, by its tool-use id or a task id its result stated; true when one ended. */
function endOf(tool: string | null, task: string | null, launches: Map<string, Launch>, closed: Set<string>): boolean {
    let ended = false;
    for (const [id, launch] of launches) {
        if (id !== tool && (task === null || !launch.tasks.has(task))) continue;
        launches.delete(id);
        closed.add(id);
        for (const own of launch.tasks) closed.add(own);
        ended = true;
    }
    return ended;
}

/** A task notification that ends something. `closed` keeps the ids of the launches already ended, so the same notice met again (queued, then delivered) is `seen`. */
function notified(text: string, launches: Map<string, Launch>, closed: Set<string>): Notice {
    if (!text.trimStart().startsWith('<task-notification>')) return 'none';
    const [task, tool, status] = [tagged(text, 'task-id'), tagged(text, 'tool-use-id'), tagged(text, 'status')];
    if (status === null || !ENDED.has(status)) return 'seen';
    return endOf(tool, task, launches, closed) || [tool, task].some((id) => id !== null && closed.has(id)) ? 'seen' : 'unseen';
}

/** A notice a row carries: queued (a `queue-operation` enqueue, which the transcript writes first) or delivered (a user row). */
function noticed(row: Row, launches: Map<string, Launch>, closed: Set<string>): Notice {
    if (row['type'] === 'queue-operation' && row['operation'] === 'enqueue') return notified(str(row['content']) ?? '', launches, closed);
    return row['type'] === 'user' ? notified(textOf(obj(row['message'])['content']), launches, closed) : 'none';
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

/** A Monitor runs at most its own timeout: one started more than that before the newest row of the tail has ended. */
function expired(launch: Launch, newest: number | null): boolean {
    return launch.expiresAfter !== null && launch.startedAt !== null && newest !== null && newest - launch.startedAt > launch.expiresAfter;
}

/** The newest time any row of the tail carries, or null when none does. */
function newestOf(rows: readonly Row[]): number | null {
    return rows.reduce<number | null>((latest, row) => {
        const at = stamped(row);
        return at === null ? latest : Math.max(latest ?? at, at);
    }, null);
}

/** What a tail says: the launches with no ending after them (`count`), and whether a notice in it ends a launch the tail never showed (`unseen`). */
export interface TailScan { readonly count: number; readonly unseen: boolean }

/** The scan of a tail, or null when no line of it parses (a tail that is only blank lines scans as nothing). */
export function scanFlight(lines: readonly string[]): TailScan | null {
    const rows = lines.map((line) => parse(line)).filter((row): row is Row => row !== null);
    if (rows.length === 0 && lines.some((line) => line.trim() !== '')) return null;
    const launches = new Map<string, Launch>();
    const closed = new Set<string>();
    let unseen = false;
    for (const row of rows) {
        launched(row, launches);
        const notice = noticed(row, launches, closed);
        if (notice === 'unseen') unseen = true;
        if (notice === 'none' && row['type'] === 'user') answered(row, launches);
    }
    const newest = newestOf(rows);
    return { count: [...launches.values()].filter((launch) => !expired(launch, newest)).length, unseen };
}

/** Launches with no ending notification after them. A launch the tail cuts off is not seen (the count is what shows), except when
 * the tail was truncated and ends a launch it never saw: that launch may have begun before the tail, so the answer is unknown. A tail with no parsable line is `Unknown`.
 * A task notification is read where it is queued (a `queue-operation` enqueue) and where it is delivered (a user row): the same notice, so either ends the work.
 * A Monitor past its own timeout (against the newest row of the tail) has ended. */
export function claudeInFlight(lines: readonly string[], truncated = false): InFlightResult {
    return answerOf(scanFlight(lines), truncated);
}

/** The answer a scan gives, for a tail that is truncated or not. */
export function answerOf(scan: TailScan | null, truncated: boolean): InFlightResult {
    if (scan === null) return unknown({ why: 'unreadable', detail: 'no line of the transcript tail parses' });
    if (truncated && scan.unseen) return unknown({ why: 'unreadable', detail: 'the tail ends work that started before it' });
    return { kind: 'in-flight', count: scan.count };
}
