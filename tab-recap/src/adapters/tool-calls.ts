// Raw tool-call rows of each agent kind → what the writer is told: a kind, the command/path/query, and the agent's own description.
import type { CallKind, Entry } from '#src/ports/transcripts.ts';
import { str, toolBrief } from './jsonl.ts';
import type { Row } from './jsonl.ts';

export interface ToolCall {
    readonly kind: CallKind;
    readonly text: string;
    readonly what?: string;
}

/** A command is clipped to 64 characters; one the agent described is sent as its description alone. */
const COMMAND_CHARS = 64;
const squash = (value: string, max = COMMAND_CHARS): string => {
    const line = value.split(/\s+/).join(' ').trim();
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** Shell commands that only look at files: `cat src/a.ts`, `rg foo`, `ls`. Anything that writes (`>`, `tee`, `sed -i`) is not. */
const LOOKS = new Set(['cat', 'sed', 'grep', 'rg', 'ls', 'head', 'tail', 'find', 'wc']);
export function isPlainRead(command: string): boolean {
    const first = command.trim().split(/\s+/)[0] ?? '';
    return LOOKS.has(first) && !/>|\btee\b|\bsed\b[^|;&]*\s-[a-zA-Z]*i/.test(command);
}

function shell(command: string, what?: string | null): ToolCall {
    const described = what !== null && what !== undefined;
    return { kind: isPlainRead(command) ? 'read' : 'shell', text: described ? '' : squash(command, COMMAND_CHARS), ...(described ? { what: squash(what, 120) } : {}) };
}

const KINDS: Readonly<Record<string, CallKind>> = Object.fromEntries([
    ...['Bash', 'bash'].map((name) => [name, 'shell']),
    ...['Read', 'Grep', 'Glob', 'LS', 'read', 'grep', 'glob', 'list'].map((name) => [name, 'read']),
    ...['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'edit', 'write', 'patch', 'apply_patch'].map((name) => [name, 'edit']),
    ...['WebFetch', 'WebSearch', 'webfetch', 'websearch', 'codesearch'].map((name) => [name, 'web']),
    ...['Agent', 'Task', 'task'].map((name) => [name, 'agent']),
]) as Readonly<Record<string, CallKind>>;

const targetOf = (input: Row): string => str(input['file_path']) ?? str(input['filePath']) ?? str(input['notebook_path']) ?? str(input['path']) ?? str(input['pattern']) ?? '';

const BUILD: Readonly<Record<CallKind, (name: string, input: Row) => ToolCall>> = {
    shell: (_, input) => shell(str(input['command']) ?? '', str(input['description'])),
    read: (_, input) => ({ kind: 'read', text: targetOf(input) }),
    edit: (_, input) => ({ kind: 'edit', text: targetOf(input) }),
    web: (_, input) => ({ kind: 'web', text: squash(str(input['url']) ?? str(input['query']) ?? '') }),
    agent: (name, input) => ({ kind: 'agent', text: squash(str(input['description']) ?? str(input['prompt']) ?? name) }),
    other: (name, input) => ({ kind: 'other', text: toolBrief(name, input) }),
};

/** claude and opencode name their tools (opencode in lower case) and pass an input object. */
export const namedCall = (name: string, input: Row): ToolCall => BUILD[KINDS[name] ?? 'other'](name, input);

/** A JS string literal (`"…"`) as the text it holds; Codex writes JSON-compatible escapes, plus the odd `\'`. */
function unquote(literal: string): string {
    try {
        return JSON.parse(literal) as string;
    } catch {
        return literal.slice(1, -1).replaceAll("\\'", "'").replaceAll('\\n', '\n').replaceAll('\\"', '"').replaceAll('\\\\', '\\');
    }
}

const EXEC = /exec_command\(\{[^]{0,200}?\bcmd\s*:\s*("(?:[^"\\]|\\.)*")/g;
const PATCHED = /\*\*\* (?:Add|Update|Delete) File: ([^\n"\\]+)/g;
const WEB_RUN = /web__run\(/;

/** Files named by `*** Add|Update|Delete File:` headers anywhere in `source` (JS source or a decoded command). */
const patchedFiles = (source: string): string[] => Array.from(source.matchAll(PATCHED), (match) => (match[1] ?? '').trim());

/** What Codex's `exec` JavaScript does: each `exec_command({cmd})` a shell call (an `apply_patch` in it: one edit per file), `web__run` a web call. */
export function execCalls(source: string): readonly ToolCall[] {
    const calls: ToolCall[] = [];
    for (const match of source.matchAll(EXEC)) {
        const command = unquote(match[1] ?? '""');
        const files = patchedFiles(command);
        calls.push(...(files.length > 0 ? files.map((file): ToolCall => ({ kind: 'edit', text: file })) : [shell(command)]));
    }
    if (calls.length === 0) {
        calls.push(...patchedFiles(source).map((file): ToolCall => ({ kind: 'edit', text: file })));
    }
    if (WEB_RUN.test(source)) {
        calls.push({ kind: 'web', text: squash(/(?:ref_id|q)\s*:\s*"([^"]+)"/.exec(source)?.[1] ?? 'web__run') });
    }
    return calls.length > 0 ? calls : [{ kind: 'other', text: 'exec' }];
}

/** Codex `function_call` / `custom_tool_call` items: `exec` carries JavaScript, the rest are named like claude's. */
export function codexCalls(name: string, raw: unknown, input: Row): readonly ToolCall[] {
    if (name === 'exec' && typeof raw === 'string') {
        return execCalls(raw);
    }
    const command = input['command'];
    return Array.isArray(command) ? [shell(command.findLast((word): word is string => typeof word === 'string') ?? '')] : [namedCall(name, input)];
}

export const toolEntry = (call: ToolCall, at?: number): Entry => ({
    role: 'tool', text: call.text, kind: call.kind, ...(call.what === undefined ? {} : { what: call.what }), ...(at === undefined ? {} : { at }),
});
