import type { CallKind, Entry } from '#src/ports/transcripts.ts';
import { str, toolBrief } from './jsonl.ts';
import type { Row } from './jsonl.ts';

export interface ToolCall {
    readonly kind: CallKind;
    readonly text: string;
    readonly what?: string;
}

const COMMAND_CHARS = 64;
export const squash = (value: string, max = COMMAND_CHARS): string => {
    const line = value.split(/\s+/).join(' ').trim();
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

const LOOKS = new Set(['cat', 'sed', 'grep', 'rg', 'ls', 'head', 'tail', 'find', 'wc']);
export function isPlainRead(command: string): boolean {
    const first = command.trim().split(/\s+/)[0] ?? '';
    return LOOKS.has(first) && !/>|\btee\b|\bsed\b[^|;&]*\s-[a-zA-Z]*i/.test(command);
}

export function shell(command: string, what?: string | null): ToolCall {
    const described = what !== null && what !== undefined;
    return { kind: isPlainRead(command) ? 'read' : 'shell', text: described ? '' : squash(command, COMMAND_CHARS), ...(described ? { what: squash(what, 120) } : {}) };
}

const targetOf = (input: Row): string => str(input['file_path']) ?? str(input['filePath']) ?? str(input['notebook_path']) ?? str(input['path']) ?? str(input['pattern']) ?? '';

export const callBuilders: Readonly<Record<CallKind, (name: string, input: Row) => ToolCall>> = {
    shell: (_, input) => shell(str(input['command']) ?? '', str(input['description'])),
    read: (_, input) => ({ kind: 'read', text: targetOf(input) }),
    edit: (_, input) => ({ kind: 'edit', text: targetOf(input) }),
    web: (_, input) => ({ kind: 'web', text: squash(str(input['url']) ?? str(input['query']) ?? '') }),
    agent: (name, input) => ({ kind: 'agent', text: squash(str(input['description']) ?? str(input['prompt']) ?? name) }),
    other: (name, input) => ({ kind: 'other', text: toolBrief(name, input) }),
};

export const toolEntry = (call: ToolCall, at?: number): Entry => ({
    role: 'tool', text: call.text, kind: call.kind, ...(call.what === undefined ? {} : { what: call.what }), ...(at === undefined ? {} : { at }),
});
