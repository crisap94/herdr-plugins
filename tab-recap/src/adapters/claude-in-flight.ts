import type { InFlightResult } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { arr, obj, parse, str } from './jsonl.ts';
import type { Row } from './jsonl.ts';

export const IN_FLIGHT_MAX_BYTES = 16 * 1024 * 1024;

const ENDED = new Set(['completed', 'failed', 'killed', 'stopped']);
const LAUNCHERS = new Set(['Agent', 'Task', 'Monitor']);

interface Launch { readonly agentTool: boolean; readonly tasks: Set<string>; readonly startedAt: number | null; readonly expiresAfter: number | null }

const textOf = (content: unknown): string =>
    typeof content === 'string' ? content : arr(content).map((block) => str(block['text']) ?? '').join('');

const tagged = (text: string, tag: string): string | null => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(text)?.[1]?.trim() || null;

const stamped = (row: Row): number | null => {
    const at = Date.parse(str(row['timestamp']) ?? '');
    return Number.isFinite(at) ? at : null;
};

function taskOf(result: Row, text: string): string | null {
    const words = /\bID: (\w+)|\(task (\w+)/.exec(text);
    return str(result['backgroundTaskId']) ?? str(result['taskId']) ?? str(result['agentId']) ?? words?.[1] ?? words?.[2] ?? null;
}

const asynchronous = (result: Row, text: string): boolean => result['isAsync'] === true || result['status'] === 'async_launched' || text.startsWith('Async agent launched');

function launchOf(block: Row, row: Row): { readonly id: string; readonly launch: Launch } | null {
    const name = str(block['name']) ?? '';
    const id = str(block['id']);
    const input = obj(block['input']);
    if (block['type'] !== 'tool_use' || id === null || (input['run_in_background'] !== true && !LAUNCHERS.has(name))) return null;
    const timeout = name === 'Monitor' && typeof input['timeout_ms'] === 'number' ? input['timeout_ms'] : null;
    return { id, launch: { agentTool: name === 'Agent' || name === 'Task', tasks: new Set(), startedAt: stamped(row), expiresAfter: timeout } };
}

function launched(row: Row, launches: Map<string, Launch>): void {
    if (row['type'] !== 'assistant' || row['isSidechain'] === true) return;
    for (const block of arr(obj(row['message'])['content'])) {
        const found = launchOf(block, row);
        if (found !== null) launches.set(found.id, found.launch);
    }
}

type Notice = 'none' | 'seen' | 'unseen';

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

function notified(text: string, launches: Map<string, Launch>, closed: Set<string>): Notice {
    if (!text.trimStart().startsWith('<task-notification>')) return 'none';
    const [task, tool, status] = [tagged(text, 'task-id'), tagged(text, 'tool-use-id'), tagged(text, 'status')];
    if (status === null || !ENDED.has(status)) return 'seen';
    return endOf(tool, task, launches, closed) || [tool, task].some((id) => id !== null && closed.has(id)) ? 'seen' : 'unseen';
}

function noticed(row: Row, launches: Map<string, Launch>, closed: Set<string>): Notice {
    if (row['type'] === 'queue-operation' && row['operation'] === 'enqueue') return notified(str(row['content']) ?? '', launches, closed);
    return row['type'] === 'user' ? notified(textOf(obj(row['message'])['content']), launches, closed) : 'none';
}

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

function expired(launch: Launch, newest: number | null): boolean {
    return launch.expiresAfter !== null && launch.startedAt !== null && newest !== null && newest - launch.startedAt > launch.expiresAfter;
}

function newestOf(rows: readonly Row[]): number | null {
    return rows.reduce<number | null>((latest, row) => {
        const at = stamped(row);
        return at === null ? latest : Math.max(latest ?? at, at);
    }, null);
}

export interface TailScan { readonly count: number; readonly unseen: boolean }

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

export function claudeInFlight(lines: readonly string[], truncated = false): InFlightResult {
    return answerOf(scanFlight(lines), truncated);
}

export function answerOf(scan: TailScan | null, truncated: boolean): InFlightResult {
    if (scan === null) return unknown({ why: 'unreadable', detail: 'no line of the transcript tail parses' });
    if (truncated && scan.unseen) return unknown({ why: 'unreadable', detail: 'the tail ends work that started before it' });
    return { kind: 'in-flight', count: scan.count };
}
