import type { CallKind } from '#src/ports/transcripts.ts';
import { callBuilders, type ToolCall } from './tool-calls.ts';
import type { Row } from './jsonl.ts';

const CLAUDE_TOOL_KINDS: Readonly<Record<string, CallKind>> = Object.fromEntries([
    ...['Bash', 'bash'].map((name) => [name, 'shell']),
    ...['Read', 'Grep', 'Glob', 'LS'].map((name) => [name, 'read']),
    ...['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].map((name) => [name, 'edit']),
    ...['WebFetch', 'WebSearch'].map((name) => [name, 'web']),
    ...['Agent', 'Task'].map((name) => [name, 'agent']),
]) as Readonly<Record<string, CallKind>>;

export const claudeNamedCall = (name: string, input: Row): ToolCall => callBuilders[CLAUDE_TOOL_KINDS[name] ?? 'other'](name, input);
