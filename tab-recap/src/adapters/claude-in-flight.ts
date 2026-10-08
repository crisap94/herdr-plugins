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
    return str(result['backgroundTaskId']) ?? str(result['taskId']) ?? str(result['agentId']) ?? /\bID: (\w+)|\(task (\w+)/.exec(text)?.slice(1).find((id) => id !== undefined) ?? null;
}

const asynchronous = (result: Row, text: string): boolean => result['isAsync'] === true || result['status'] === 'async_launched' || text.startsWith('Async agent launched');

/** Launches with no ending notification after them. A launch the tail cuts off is not seen; a tail with no parsable line is `Unknown`. */
export function claudeInFlight(lines: readonly string[]): InFlightResult {
    const rows = lines.map((line) => parse(line)).filter((row): row is Row => row !== null);
    if (rows.length === 0 && lines.some((line) => line.trim() !== '')) return unknown({ why: 'unreadable', detail: 'no line of the transcript tail parses' });
    const launches = new Map<string, Launch>();
    for (const row of rows) {
        const message = obj(row['message']);
        if (row['type'] === 'assistant' && row['isSidechain'] !== true) {
            for (const block of arr(message['content'])) {
                const name = str(block['name']) ?? '';
                const id = str(block['id']);
                if (block['type'] === 'tool_use' && id !== null && (obj(block['input'])['run_in_background'] === true || LAUNCHERS.has(name))) launches.set(id, { agentTool: name === 'Agent' || name === 'Task', tasks: new Set() });
            }
        } else if (row['type'] === 'user') {
            const content = message['content'];
            const text = textOf(content);
            if (text.trimStart().startsWith('<task-notification>')) {
                const [task, tool, status] = [tagged(text, 'task-id'), tagged(text, 'tool-use-id'), tagged(text, 'status')];
                if (status === null || !ENDED.has(status)) continue;
                for (const [id, launch] of launches) if (id === tool || (task !== null && launch.tasks.has(task))) launches.delete(id);
                continue;
            }
            for (const block of arr(content)) {
                const launch = launches.get(str(block['tool_use_id']) ?? '');
                if (block['type'] !== 'tool_result' || launch === undefined) continue;
                const [result, said] = [obj(row['toolUseResult']), textOf(block['content'])];
                const task = taskOf(result, said);
                if (task !== null) launch.tasks.add(task);
                if (launch.agentTool && !asynchronous(result, said)) launches.delete(str(block['tool_use_id']) ?? '');
            }
        }
    }
    return { kind: 'in-flight', count: launches.size };
}
