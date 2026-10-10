import type { CallKind } from '#src/ports/transcripts.ts';
import type { Row } from './jsonl.ts';
import { callBuilders, shell, squash } from './tool-calls.ts';
import type { ToolCall } from './tool-calls.ts';

const CODEX_TOOL_KINDS: Readonly<Record<string, CallKind>> = { apply_patch: 'edit' };

const unquote = (literal: string): string => {
    try {
        return JSON.parse(literal) as string;
    } catch {
        return literal.slice(1, -1).replaceAll("\\'", "'").replaceAll('\\n', '\n').replaceAll('\\"', '"').replaceAll('\\\\', '\\');
    }
};

const EXEC = /exec_command\(\{[^]{0,200}?\bcmd\s*:\s*("(?:[^"\\]|\\.)*")/g;
const PATCHED = /\*\*\* (?:Add|Update|Delete) File: ([^\n"\\]+)/g;
const WEB_RUN = /web__run\(/;

const patchedFiles = (source: string): string[] => Array.from(source.matchAll(PATCHED), (match) => (match[1] ?? '').trim());

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

const namedCall = (name: string, input: Row): ToolCall => callBuilders[CODEX_TOOL_KINDS[name] ?? 'other'](name, input);

export function codexCalls(name: string, raw: unknown, input: Row): readonly ToolCall[] {
    if (name === 'exec' && typeof raw === 'string') {
        return execCalls(raw);
    }
    const command = input['command'];
    return Array.isArray(command) ? [shell(command.findLast((word): word is string => typeof word === 'string') ?? '')] : [namedCall(name, input)];
}
