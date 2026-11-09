import { toolClass, toolTarget, ToolClass } from '@stateforge-labs/harness-adapters';
import type { CallKind, Entry } from '#src/ports/transcripts.ts';
import { str, toolBrief } from './jsonl.ts';
import type { Row } from './jsonl.ts';

export interface ToolCall {
    readonly kind: CallKind;
    readonly text: string;
    readonly what?: string;
}

type HarnessKind = Parameters<typeof toolClass>[0];

const COMMAND_CHARS = 64;
const LOCAL_CLASSES: Readonly<Partial<Record<HarnessKind, Readonly<Record<string, ToolClass>>>>> = {
    opencode: { task: ToolClass.Agent },
};
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

const commandOf = (input: Row): ToolCall => shell(str(input['command']) ?? '', str(input['description']));
const webOf = (input: Row): string => squash(str(input['url']) ?? str(input['query']) ?? '');
const agentOf = (name: string, input: Row): string => squash(str(input['description']) ?? str(input['prompt']) ?? name);

export function namedCall(harness: HarnessKind, name: string, input: Row): ToolCall {
    const target = toolTarget(harness, name, input) ?? '';
    switch (LOCAL_CLASSES[harness]?.[name] ?? toolClass(harness, name)) {
        case ToolClass.Shell:
            return commandOf(input);
        case ToolClass.Read:
            return { kind: 'read', text: target };
        case ToolClass.Edit:
            return { kind: 'edit', text: target };
        case ToolClass.Web:
            return { kind: 'web', text: webOf(input) };
        case ToolClass.Agent:
            return { kind: 'agent', text: agentOf(name, input) };
        default:
            return { kind: 'other', text: toolBrief(name, input) };
    }
}

export const toolEntry = (call: ToolCall, at?: number): Entry => ({
    role: 'tool', text: call.text, kind: call.kind, ...(call.what === undefined ? {} : { what: call.what }), ...(at === undefined ? {} : { at }),
});
